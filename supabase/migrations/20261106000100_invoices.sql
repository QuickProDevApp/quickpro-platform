-- Invoices between businesses for agreed work.
--
-- The business that does the work bills the one it works for:
-- - project:     the awarded contractor invoices the customer
-- - subcontract: the subcontractor invoices the prime contractor
--
-- An invoice starts as a draft the issuer edits (line items, due date, tax
-- rate, payment instructions), is issued with a number from the issuer's own
-- sequence, and is then marked paid by the issuer when the money arrives, or
-- voided with a reason. QuickPro does not process payments yet: the payer
-- pays the issuer directly as they agreed, and the invoice records it.
-- Workers are not invoiced or paid here (see D-009).
--
-- Additive: new types, tables and functions. No data is changed or removed.

create type public.invoice_status as enum ('draft', 'issued', 'paid', 'void');
create type public.payment_method as enum ('check', 'ach', 'wire', 'card', 'cash', 'other');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  context public.work_context not null check (context in ('project', 'subcontract')),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  subcontract_id uuid references public.subcontracts (id) on delete cascade,
  issuer_org_id uuid not null references public.organizations (id) on delete cascade,
  recipient_org_id uuid not null references public.organizations (id) on delete cascade,
  number text check (number is null or number ~ '^INV-[0-9]{4,}$'),
  status public.invoice_status not null default 'draft',
  issue_date date,
  due_date date,
  notes text not null default '' check (char_length(notes) <= 2000),
  payment_instructions text not null default '' check (char_length(payment_instructions) <= 1000),
  -- Line items, in order: [{"description", "quantity", "unit_cents", "amount_cents"}].
  -- Kept on the invoice (validated by save_invoice_draft) and frozen once issued.
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 50),
  -- Sales tax rate in thousandths of a percent: 8.625% is 8625.
  tax_rate_mpct int not null default 0 check (tax_rate_mpct between 0 and 25000),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  issued_at timestamptz,
  issued_by uuid references public.profiles (id) on delete set null,
  paid_on date,
  paid_at timestamptz,
  paid_recorded_by uuid references public.profiles (id) on delete set null,
  payment_method public.payment_method,
  payment_reference text not null default '' check (char_length(payment_reference) <= 200),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text check (void_reason is null or char_length(void_reason) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((context = 'subcontract') = (subcontract_id is not null)),
  check (issuer_org_id <> recipient_org_id),
  check (status = 'draft' or status = 'void' or (number is not null and issue_date is not null and due_date is not null)),
  check (status <> 'paid' or (paid_on is not null and payment_method is not null))
);

create unique index invoices_number_idx on public.invoices (issuer_org_id, number) where number is not null;
create index invoices_issuer_idx on public.invoices (issuer_org_id, created_at desc);
create index invoices_recipient_idx on public.invoices (recipient_org_id, created_at desc);
create index invoices_request_idx on public.invoices (request_id);

create trigger invoices_touch before update on public.invoices
  for each row execute function app.touch_updated_at();

-- Each business's own invoice numbers: INV-0001, INV-0002...
create table public.invoice_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number int not null default 0
);

-- ---------------------------------------------------------------------------
-- Who may see an invoice
-- ---------------------------------------------------------------------------
create or replace function app.invoice_side(p_invoice public.invoices)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.is_org_member(p_invoice.issuer_org_id) then 'issuer'
    when p_invoice.status <> 'draft' and app.is_org_member(p_invoice.recipient_org_id) then 'recipient'
    when app.is_admin() then 'staff'
  end;
$$;

alter table public.invoices enable row level security;
alter table public.invoice_counters enable row level security;

create policy "issuer, recipient once issued, and staff read invoices"
  on public.invoices for select to authenticated
  using (app.invoice_side(invoices) is not null);

grant select on public.invoices to authenticated;
-- invoice_counters: no client access.

create trigger audit_invoices after insert or update or delete on public.invoices
  for each row execute function app.audit_row_change('invoice', 'id', 'issuer_org_id');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.invoice_label(p_invoice public.invoices)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_invoice.number, 'Draft invoice') || ' for ' || to_char(p_invoice.total_cents / 100.0, 'FM$999,999,990.00');
$$;

-- An issued invoice is overdue the day after its due date, New York time.
create or replace function app.invoice_overdue(p_invoice public.invoices)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_invoice.status = 'issued' and p_invoice.due_date < (now() at time zone 'America/New_York')::date;
$$;

create or replace function app.log_invoice_event(p_invoice public.invoices, p_kind text, p_summary text, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sc public.subcontracts;
begin
  if p_invoice.context = 'project' then
    perform app.log_request_event(p_invoice.request_id, p_kind, p_summary, p_detail, null);
  else
    select * into v_sc from public.subcontracts where id = p_invoice.subcontract_id;
    perform app.log_subcontract_event(v_sc, p_kind, p_summary, p_detail);
  end if;
end;
$$;

-- Loads an invoice for a write by its issuer's dispatchers, locked.
create or replace function app.issuer_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invoices;
begin
  select * into v from public.invoices where id = p_invoice_id for update;
  if v.id is null or not app.is_org_member(v.issuer_org_id) then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  if not app.can_dispatch(v.issuer_org_id) then
    raise exception 'Owners, admins and dispatchers on your team manage invoices.' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Writing invoices
-- ---------------------------------------------------------------------------

-- A new draft from the business doing the work, prefilled with what is left
-- of the agreed price (the accepted quote or the subcontract amount).
create or replace function public.create_invoice(p_context public.work_context, p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  v_id uuid;
  v_agreed bigint;
  v_invoiced bigint;
  v_description text;
begin
  if p_context not in ('project', 'subcontract') then
    raise exception 'Invoices are for projects and subcontracts.' using errcode = 'P0001';
  end if;
  select * into w from app.work_parties(p_context, p_target);
  if w.side_a is null or not app.is_org_member(w.org_b) then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  if not app.can_dispatch(w.org_b) then
    raise exception 'Owners, admins and dispatchers on your team manage invoices.' using errcode = 'P0001';
  end if;
  if not w.engaged then
    raise exception 'You can invoice only for work that was agreed.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.invoices where issuer_org_id = w.org_b and created_at > now() - interval '1 day') >= 50 then
    raise exception 'That''s a lot of invoices in one day. Try again tomorrow, or contact QuickPro support.' using errcode = 'P0001';
  end if;

  if p_context = 'project' then
    select q.amount_cents, 'Work on ' || r.title into v_agreed, v_description
    from public.service_requests r join public.quotes q on q.id = r.awarded_quote_id
    where r.id = p_target;
  else
    select s.amount_cents, left('Subcontract: ' || s.scope, 500) into v_agreed, v_description
    from public.subcontracts s where s.id = p_target;
  end if;
  select coalesce(sum(subtotal_cents), 0) into v_invoiced
  from public.invoices i
  where i.status <> 'void'
    and ((p_context = 'project' and i.context = 'project' and i.request_id = p_target)
         or (p_context = 'subcontract' and i.subcontract_id = p_target));

  insert into public.invoices (context, request_id, subcontract_id, issuer_org_id, recipient_org_id, created_by, due_date,
                               lines, subtotal_cents, total_cents)
  select p_context, w.request_id, case when p_context = 'subcontract' then p_target end, w.org_b, w.org_a, auth.uid(),
         (now() at time zone 'America/New_York')::date + 30,
         case when v_remaining > 0
              then jsonb_build_array(jsonb_build_object('description', v_description, 'quantity', 1,
                                                        'unit_cents', v_remaining, 'amount_cents', v_remaining))
              else '[]'::jsonb end,
         greatest(v_remaining, 0), greatest(v_remaining, 0)
  from (select coalesce(v_agreed, 0) - v_invoiced as v_remaining) x
  returning id into v_id;
  return v_id;
end;
$$;

-- Saves a draft: due date, notes, payment instructions, tax rate and line
-- items as [{"description", "quantity", "unit_cents"}]. Totals are worked
-- out here, never taken from the client.
create or replace function public.save_invoice_draft(
  p_invoice_id uuid, p_due_date date, p_notes text, p_payment_instructions text, p_tax_rate_mpct int, p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invoices := app.issuer_invoice(p_invoice_id);
  v_line jsonb;
  v_lines jsonb := '[]';
  v_desc text;
  v_qty numeric;
  v_unit bigint;
  v_amount bigint;
  v_subtotal bigint := 0;
  v_tax bigint;
begin
  if v.status <> 'draft' then
    raise exception 'Only a draft can be edited. Void this invoice and start a new one to change it.' using errcode = 'P0001';
  end if;
  if p_due_date is null then
    raise exception 'Choose a due date.' using errcode = 'P0001';
  end if;
  if p_due_date > (now() at time zone 'America/New_York')::date + 365 then
    raise exception 'The due date must be within a year.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Keep the notes under 2,000 characters.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_payment_instructions, '')) > 1000 then
    raise exception 'Keep the payment instructions under 1,000 characters.' using errcode = 'P0001';
  end if;
  if p_tax_rate_mpct is null or p_tax_rate_mpct < 0 or p_tax_rate_mpct > 25000 then
    raise exception 'Enter a sales tax rate from 0 to 25%%.' using errcode = 'P0001';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Add at least one line.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'An invoice can have up to 50 lines.' using errcode = 'P0001';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_desc := btrim(coalesce(v_line ->> 'description', ''));
    begin
      v_qty := (v_line ->> 'quantity')::numeric;
      v_unit := (v_line ->> 'unit_cents')::bigint;
    exception when others then
      raise exception 'Each line needs a quantity and a price.' using errcode = 'P0001';
    end;
    if v_desc = '' or char_length(v_desc) > 500 then
      raise exception 'Describe each line (up to 500 characters).' using errcode = 'P0001';
    end if;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 or v_qty <> round(v_qty, 2) then
      raise exception 'Quantities must be more than 0, with up to two decimals.' using errcode = 'P0001';
    end if;
    if v_unit is null or v_unit < 0 or v_unit > 100000000 then
      raise exception 'Line prices must be between $0 and $1,000,000.' using errcode = 'P0001';
    end if;
    v_amount := round(v_qty * v_unit)::bigint;
    v_subtotal := v_subtotal + v_amount;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'description', v_desc, 'quantity', v_qty, 'unit_cents', v_unit, 'amount_cents', v_amount));
  end loop;
  v_tax := round(v_subtotal * p_tax_rate_mpct / 100000.0)::bigint;

  update public.invoices
     set due_date = p_due_date,
         notes = btrim(coalesce(p_notes, '')),
         payment_instructions = btrim(coalesce(p_payment_instructions, '')),
         tax_rate_mpct = p_tax_rate_mpct,
         lines = v_lines,
         subtotal_cents = v_subtotal,
         tax_cents = v_tax,
         total_cents = v_subtotal + v_tax
   where id = v.id;
end;
$$;

-- Issues a draft: numbers it, freezes it, and tells the business it's billed to.
create or replace function public.issue_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invoices := app.issuer_invoice(p_invoice_id);
  w record;
  v_seq int;
  v_number text;
  v_issuer text;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if v.status <> 'draft' then
    raise exception 'This invoice was already issued.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v.lines) = 0 or v.total_cents <= 0 then
    raise exception 'Add at least one line with an amount before issuing.' using errcode = 'P0001';
  end if;
  if v.due_date is null or v.due_date < v_today then
    raise exception 'Choose a due date of today or later.' using errcode = 'P0001';
  end if;
  select * into w from app.work_parties(v.context, coalesce(v.subcontract_id, v.request_id));
  if not w.engaged then
    raise exception 'This work is no longer active, so it can''t be invoiced.' using errcode = 'P0001';
  end if;

  insert into public.invoice_counters (organization_id, last_number) values (v.issuer_org_id, 1)
  on conflict (organization_id) do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_seq;
  v_number := 'INV-' || lpad(v_seq::text, 4, '0');

  update public.invoices
     set status = 'issued', number = v_number, issue_date = v_today, issued_at = now(), issued_by = auth.uid()
   where id = v.id
  returning * into v;

  select name into v_issuer from public.organizations where id = v.issuer_org_id;
  perform app.notify_dispatchers(v.recipient_org_id, 'invoice.issued', v_issuer || ' sent ' || app.invoice_label(v),
    w.title || ' · due ' || to_char(v.due_date, 'Mon FMDD, YYYY'),
    '/app/org/' || v.recipient_org_id || '/invoices/' || v.id, null);
  perform app.log_invoice_event(v, 'invoice.issued', v_issuer || ' issued ' || app.invoice_label(v),
    'Due ' || to_char(v.due_date, 'Mon FMDD, YYYY'));
  return v_number;
end;
$$;

-- The issuer records that it was paid, outside QuickPro.
create or replace function public.record_invoice_payment(
  p_invoice_id uuid, p_paid_on date, p_method public.payment_method, p_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invoices := app.issuer_invoice(p_invoice_id);
  v_issuer text;
begin
  if v.status <> 'issued' then
    raise exception 'Only an issued, unpaid invoice can be marked paid.' using errcode = 'P0001';
  end if;
  if p_method is null then
    raise exception 'Choose how it was paid.' using errcode = 'P0001';
  end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'America/New_York')::date or p_paid_on < v.issue_date - 365 then
    raise exception 'Enter the date the payment arrived (not in the future).' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_reference, '')) > 200 then
    raise exception 'Keep the reference under 200 characters.' using errcode = 'P0001';
  end if;
  update public.invoices
     set status = 'paid', paid_on = p_paid_on, paid_at = now(), paid_recorded_by = auth.uid(),
         payment_method = p_method, payment_reference = btrim(coalesce(p_reference, ''))
   where id = v.id
  returning * into v;
  select name into v_issuer from public.organizations where id = v.issuer_org_id;
  perform app.notify_dispatchers(v.recipient_org_id, 'invoice.paid', v_issuer || ' marked ' || v.number || ' paid',
    'Payment received ' || to_char(p_paid_on, 'Mon FMDD, YYYY') || '.',
    '/app/org/' || v.recipient_org_id || '/invoices/' || v.id, null);
  perform app.log_invoice_event(v, 'invoice.paid', v.number || ' marked paid', '');
end;
$$;

-- Voids a draft or an unpaid invoice, with a reason the other business sees.
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invoices := app.issuer_invoice(p_invoice_id);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_was text := v.status::text;
  v_issuer text;
begin
  if v.status not in ('draft', 'issued') then
    raise exception 'A paid or voided invoice can''t be voided.' using errcode = 'P0001';
  end if;
  if v.status = 'issued' and v_reason = '' then
    raise exception 'Say why you''re voiding it. The business it was sent to sees this.' using errcode = 'P0001';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Keep the reason under 1,000 characters.' using errcode = 'P0001';
  end if;
  update public.invoices
     set status = 'void', voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = v.id
  returning * into v;
  if v_was = 'issued' then
    select name into v_issuer from public.organizations where id = v.issuer_org_id;
    perform app.notify_dispatchers(v.recipient_org_id, 'invoice.voided', v_issuer || ' voided ' || v.number, v_reason,
      '/app/org/' || v.recipient_org_id || '/invoices/' || v.id, null);
    perform app.log_invoice_event(v, 'invoice.voided', v.number || ' voided', v_reason);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading invoices
-- ---------------------------------------------------------------------------
create or replace function app.invoice_rows(p_org_id uuid, p_all boolean, p_status public.invoice_status)
returns table (
  id uuid, context public.work_context, request_id uuid, subcontract_id uuid, title text,
  issuer_org_id uuid, issuer_name text, recipient_org_id uuid, recipient_name text,
  number text, status public.invoice_status, overdue boolean, issue_date date, due_date date,
  subtotal_cents bigint, tax_cents bigint, total_cents bigint, paid_on date, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.context, i.request_id, i.subcontract_id, r.title,
         i.issuer_org_id, iss.name, i.recipient_org_id, rec.name,
         i.number, i.status, app.invoice_overdue(i), i.issue_date, i.due_date,
         i.subtotal_cents, i.tax_cents, i.total_cents, i.paid_on, i.created_at
  from public.invoices i
  join public.service_requests r on r.id = i.request_id
  join public.organizations iss on iss.id = i.issuer_org_id
  join public.organizations rec on rec.id = i.recipient_org_id
  where (p_all or i.issuer_org_id = p_org_id or (i.recipient_org_id = p_org_id and i.status <> 'draft'))
    and (p_status is null or i.status = p_status)
  order by case i.status when 'draft' then 0 when 'issued' then 1 else 2 end, coalesce(i.due_date, i.created_at::date), i.created_at desc
  limit 500;
$$;

-- A business's invoices, sent and received (drafts only its own).
create or replace function public.org_invoices(p_org_id uuid)
returns table (
  id uuid, context public.work_context, request_id uuid, subcontract_id uuid, title text,
  issuer_org_id uuid, issuer_name text, recipient_org_id uuid, recipient_name text,
  number text, status public.invoice_status, overdue boolean, issue_date date, due_date date,
  subtotal_cents bigint, tax_cents bigint, total_cents bigint, paid_on date, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_org_member(p_org_id) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  return query select * from app.invoice_rows(p_org_id, false, null);
end;
$$;

-- Every invoice, for QuickPro staff.
create or replace function public.admin_invoices(p_status public.invoice_status)
returns table (
  id uuid, context public.work_context, request_id uuid, subcontract_id uuid, title text,
  issuer_org_id uuid, issuer_name text, recipient_org_id uuid, recipient_name text,
  number text, status public.invoice_status, overdue boolean, issue_date date, due_date date,
  subtotal_cents bigint, tax_cents bigint, total_cents bigint, paid_on date, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  return query select * from app.invoice_rows(null, true, p_status);
end;
$$;

-- One invoice with both businesses' billing details and the viewer's side.
create or replace function public.get_invoice(p_invoice_id uuid)
returns table (
  id uuid, context public.work_context, request_id uuid, subcontract_id uuid, title text, area_name text,
  issuer_org_id uuid, issuer_name text, issuer_legal_name text, issuer_address text, issuer_phone text, issuer_email text,
  recipient_org_id uuid, recipient_name text, recipient_legal_name text, recipient_address text, recipient_email text,
  number text, status public.invoice_status, overdue boolean, issue_date date, due_date date,
  lines jsonb, tax_rate_mpct int, subtotal_cents bigint, tax_cents bigint, total_cents bigint,
  notes text, payment_instructions text,
  paid_on date, payment_method public.payment_method, payment_reference text,
  voided_at timestamptz, void_reason text, created_at timestamptz, issued_at timestamptz,
  viewer_side text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.invoices;
  v_side text;
begin
  select * into v from public.invoices x where x.id = p_invoice_id;
  if v.id is null then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  v_side := app.invoice_side(v);
  if v_side is null then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  return query
  select v.id, v.context, v.request_id, v.subcontract_id, r.title, a.name,
         iss.id, iss.name, iss.legal_name,
         concat_ws(', ', iss.address_line1, iss.city, nullif(concat_ws(' ', 'NY', iss.postal_code), 'NY')), iss.phone, iss.email,
         rec.id, rec.name, rec.legal_name,
         concat_ws(', ', rec.address_line1, rec.city, nullif(concat_ws(' ', 'NY', rec.postal_code), 'NY')), rec.email,
         v.number, v.status, app.invoice_overdue(v), v.issue_date, v.due_date,
         v.lines, v.tax_rate_mpct, v.subtotal_cents, v.tax_cents, v.total_cents,
         v.notes, v.payment_instructions,
         v.paid_on, v.payment_method, v.payment_reference,
         v.voided_at, v.void_reason, v.created_at, v.issued_at,
         v_side
  from public.service_requests r
  join public.service_areas a on a.id = r.service_area_id
  join public.organizations iss on iss.id = v.issuer_org_id
  join public.organizations rec on rec.id = v.recipient_org_id
  where r.id = v.request_id;
end;
$$;

-- Invoices on one project or subcontract that the viewer may see, with what
-- was agreed and what is invoiced so far.
create or replace function public.work_invoices(p_context public.work_context, p_target uuid)
returns table (
  id uuid, number text, status public.invoice_status, overdue boolean, issue_date date, due_date date,
  total_cents bigint, paid_on date, created_at timestamptz,
  viewer_side text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w record;
begin
  if p_context not in ('project', 'subcontract') then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  select * into w from app.work_parties(p_context, p_target);
  if w.side_a is null or not (app.is_org_member(w.org_a) or app.is_org_member(w.org_b) or app.is_admin()) then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  return query
  select i.id, i.number, i.status, app.invoice_overdue(i), i.issue_date, i.due_date, i.total_cents, i.paid_on, i.created_at,
         app.invoice_side(i)
  from public.invoices i
  where ((p_context = 'project' and i.context = 'project' and i.request_id = p_target)
         or (p_context = 'subcontract' and i.subcontract_id = p_target))
    and app.invoice_side(i) is not null
  order by i.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function app.invoice_side(public.invoices) from public;
revoke all on function app.invoice_label(public.invoices) from public;
revoke all on function app.invoice_overdue(public.invoices) from public;
revoke all on function app.log_invoice_event(public.invoices, text, text, text) from public;
revoke all on function app.issuer_invoice(uuid) from public;
revoke all on function app.invoice_rows(uuid, boolean, public.invoice_status) from public;
-- Used by row level security policies.
grant execute on function app.invoice_side(public.invoices) to authenticated;

revoke all on function public.create_invoice(public.work_context, uuid) from public;
revoke all on function public.save_invoice_draft(uuid, date, text, text, int, jsonb) from public;
revoke all on function public.issue_invoice(uuid) from public;
revoke all on function public.record_invoice_payment(uuid, date, public.payment_method, text) from public;
revoke all on function public.void_invoice(uuid, text) from public;
revoke all on function public.org_invoices(uuid) from public;
revoke all on function public.admin_invoices(public.invoice_status) from public;
revoke all on function public.get_invoice(uuid) from public;
revoke all on function public.work_invoices(public.work_context, uuid) from public;
grant execute on function public.create_invoice(public.work_context, uuid) to authenticated;
grant execute on function public.save_invoice_draft(uuid, date, text, text, int, jsonb) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.record_invoice_payment(uuid, date, public.payment_method, text) to authenticated;
grant execute on function public.void_invoice(uuid, text) to authenticated;
grant execute on function public.org_invoices(uuid) to authenticated;
grant execute on function public.admin_invoices(public.invoice_status) to authenticated;
grant execute on function public.get_invoice(uuid) to authenticated;
grant execute on function public.work_invoices(public.work_context, uuid) to authenticated;
