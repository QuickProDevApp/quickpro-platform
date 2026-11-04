-- Card payments on invoices through Stripe Connect, in test mode (D-040).
--
-- A contractor connects a Stripe Express account to get paid by card. The
-- business it billed pays an issued invoice on a Stripe-hosted checkout page;
-- the money settles to the contractor's Stripe account (Stripe "destination"
-- charges on behalf of the contractor). QuickPro never sees card numbers.
-- No platform fee is taken: the fee is a business decision not yet made.
--
-- Stripe tells us what happened through signed webhooks. The server records
-- them through a narrow database role (quickpro_payments) that can only call
-- the functions below; each Stripe event is processed once (stripe_events).
-- The app refuses live Stripe keys (src/server/env.ts) until approved.
--
-- Nothing here deletes or drops anything. It adds a type, tables, a role and
-- functions.

-- A contractor's connected Stripe account, as Stripe last reported it.
create table public.stripe_accounts (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]{6,64}$'),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_due int not null default 0 check (requirements_due >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_accounts enable row level security;
create policy "members and staff read the payout account"
  on public.stripe_accounts for select to authenticated
  using (app.is_org_member(organization_id) or app.is_admin());
grant select (organization_id, charges_enabled, payouts_enabled, details_submitted, requirements_due, created_at, updated_at)
  on public.stripe_accounts to authenticated;

create trigger audit_stripe_accounts after insert or update or delete on public.stripe_accounts
  for each row execute function app.audit_row_change('stripe_account', 'organization_id', 'organization_id');

create type public.card_payment_status as enum ('open', 'paid', 'expired');

-- One row per Stripe checkout started on an invoice.
create table public.invoice_card_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  checkout_session_id text not null unique check (checkout_session_id ~ '^cs_[A-Za-z0-9_]{6,200}$'),
  stripe_account_id text not null,
  amount_cents bigint not null check (amount_cents > 0),
  status public.card_payment_status not null default 'open',
  payment_intent_id text check (payment_intent_id is null or payment_intent_id ~ '^pi_[A-Za-z0-9_]{6,200}$'),
  started_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);

create index invoice_card_payments_invoice_idx on public.invoice_card_payments (invoice_id, created_at desc);

alter table public.invoice_card_payments enable row level security;
create policy "both businesses and staff read card payments"
  on public.invoice_card_payments for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id and app.invoice_side(i) is not null));
grant select (id, invoice_id, amount_cents, status, payment_intent_id, created_at, expires_at, completed_at)
  on public.invoice_card_payments to authenticated;

create trigger audit_invoice_card_payments after insert or update or delete on public.invoice_card_payments
  for each row execute function app.audit_row_change('invoice_card_payment', 'id', '');

-- Every Stripe event processed, so a redelivery is ignored.
create table public.stripe_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9_]{6,200}$'),
  type text not null,
  outcome text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
create policy "staff read stripe events" on public.stripe_events for select to authenticated using (app.is_admin());
grant select on public.stripe_events to authenticated;

-- ---------------------------------------------------------------------------
-- What signed-in people can do
-- ---------------------------------------------------------------------------

-- Owners and admins of an approved contractor set up payouts. Returns the
-- connected account id if there is one already.
create or replace function public.payout_setup_account(p_org_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations where id = p_org_id;
  if v_org.id is null or not app.is_org_member(p_org_id) then
    raise exception 'Business not found.' using errcode = 'P0002';
  end if;
  if not app.can_manage_org(p_org_id) then
    raise exception 'Only owners and admins can set up card payments.' using errcode = 'P0001';
  end if;
  if v_org.kind <> 'contractor' or v_org.status <> 'approved' then
    raise exception 'Card payments are for approved contractors.' using errcode = 'P0001';
  end if;
  return (select stripe_account_id from public.stripe_accounts where organization_id = p_org_id);
end;
$$;

-- What a payer needs to start a card payment: the payer's dispatchers, on an
-- issued invoice from a business that can take cards.
create or replace function public.card_payment_target(p_invoice_id uuid)
returns table (amount_cents bigint, stripe_account_id text, number text, issuer_name text, recipient_org_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.invoices;
  v_acct public.stripe_accounts;
begin
  select * into v from public.invoices where id = p_invoice_id;
  if v.id is null or not (app.is_org_member(v.recipient_org_id)) then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  if not app.can_dispatch(v.recipient_org_id) then
    raise exception 'Owners, admins and dispatchers on your team pay invoices.' using errcode = 'P0001';
  end if;
  if v.status <> 'issued' then
    raise exception 'Only an issued, unpaid invoice can be paid.' using errcode = 'P0001';
  end if;
  if v.total_cents < 50 then
    raise exception 'Card payments need an invoice of at least $0.50.' using errcode = 'P0001';
  end if;
  select * into v_acct from public.stripe_accounts a where a.organization_id = v.issuer_org_id;
  if v_acct.organization_id is null or not v_acct.charges_enabled then
    raise exception 'This business doesn''t take card payments through QuickPro. Pay them directly.' using errcode = 'P0001';
  end if;
  return query
  select v.total_cents, v_acct.stripe_account_id, v.number, o.name, v.recipient_org_id
  from public.organizations o where o.id = v.issuer_org_id;
end;
$$;

-- Whether the issuer of an invoice takes cards, for either side's view.
create or replace function public.invoice_accepts_cards(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.charges_enabled
    from public.invoices i join public.stripe_accounts a on a.organization_id = i.issuer_org_id
    where i.id = p_invoice_id and app.invoice_side(i) is not null
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- The payments role: what Stripe told us
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'quickpro_payments') then
    create role quickpro_payments nologin noinherit;
  end if;
end;
$$;
grant quickpro_payments to current_user;
grant usage on schema app to quickpro_payments;

-- Saves a connected account's state from Stripe. An organization keeps the
-- account it first connected.
create or replace function app.payments_save_account(
  p_org_id uuid, p_account_id text, p_charges boolean, p_payouts boolean, p_details boolean, p_due int, p_user uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing text;
begin
  select stripe_account_id into v_existing from public.stripe_accounts where organization_id = p_org_id for update;
  if v_existing is not null and v_existing <> p_account_id then
    raise exception 'This business already has a different Stripe account.' using errcode = 'P0001';
  end if;
  insert into public.stripe_accounts as s (organization_id, stripe_account_id, charges_enabled, payouts_enabled,
                                           details_submitted, requirements_due, created_by)
  values (p_org_id, p_account_id, coalesce(p_charges, false), coalesce(p_payouts, false), coalesce(p_details, false),
          greatest(coalesce(p_due, 0), 0), p_user)
  on conflict (organization_id) do update
     set charges_enabled = excluded.charges_enabled, payouts_enabled = excluded.payouts_enabled,
         details_submitted = excluded.details_submitted, requirements_due = excluded.requirements_due,
         updated_at = now()
   where (s.charges_enabled, s.payouts_enabled, s.details_submitted, s.requirements_due)
         is distinct from (excluded.charges_enabled, excluded.payouts_enabled, excluded.details_submitted,
                           excluded.requirements_due);
end;
$$;

-- Records a checkout the server created for a payer it already checked
-- with card_payment_target. The amount and account must still match.
create or replace function app.payments_open_checkout(
  p_invoice_id uuid, p_session_id text, p_account_id text, p_amount_cents bigint, p_user uuid, p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invoices;
begin
  select * into v from public.invoices where id = p_invoice_id;
  if v.id is null or v.status <> 'issued' or v.total_cents <> p_amount_cents
     or not exists (select 1 from public.stripe_accounts a
                    where a.organization_id = v.issuer_org_id and a.stripe_account_id = p_account_id) then
    raise exception 'The invoice changed. Reload and try again.' using errcode = 'P0001';
  end if;
  insert into public.invoice_card_payments (invoice_id, checkout_session_id, stripe_account_id, amount_cents, started_by, expires_at)
  values (p_invoice_id, p_session_id, p_account_id, p_amount_cents, p_user, p_expires_at);
end;
$$;

-- A checkout finished and Stripe says it is paid: settle the invoice.
create or replace function app.payments_settle(p_session_id text, p_amount_cents bigint, p_payment_intent text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.invoice_card_payments;
  v public.invoices;
  v_issuer text;
  v_recipient text;
begin
  select * into v_pay from public.invoice_card_payments where checkout_session_id = p_session_id for update;
  if v_pay.id is null then
    return 'unknown_session';
  end if;
  if v_pay.status = 'paid' then
    return 'already_paid';
  end if;
  if p_amount_cents is distinct from v_pay.amount_cents then
    return 'amount_mismatch';
  end if;
  update public.invoice_card_payments
     set status = 'paid', payment_intent_id = p_payment_intent, completed_at = now()
   where id = v_pay.id;

  select * into v from public.invoices where id = v_pay.invoice_id for update;
  select name into v_issuer from public.organizations where id = v.issuer_org_id;
  select name into v_recipient from public.organizations where id = v.recipient_org_id;
  if v.status <> 'issued' then
    -- Paid by card after it was marked paid or voided: the issuer refunds in
    -- Stripe if they need to. The invoice itself isn't changed.
    perform app.notify_dispatchers(v.issuer_org_id, 'invoice.card_payment_extra',
      'Card payment on ' || coalesce(v.number, 'an invoice') || ' that was already ' || v.status::text,
      v_recipient || ' paid ' || to_char(v_pay.amount_cents / 100.0, 'FM$999,999,990.00')
        || ' by card. Refund it from your Stripe dashboard if it isn''t owed.',
      '/app/org/' || v.issuer_org_id || '/invoices/' || v.id, null);
    return 'invoice_not_open';
  end if;

  update public.invoices
     set status = 'paid', paid_on = (now() at time zone 'America/New_York')::date, paid_at = now(),
         paid_recorded_by = null, payment_method = 'card', payment_reference = coalesce(p_payment_intent, p_session_id)
   where id = v.id
  returning * into v;
  perform app.notify_dispatchers(v.issuer_org_id, 'invoice.card_paid', v_recipient || ' paid ' || v.number || ' by card',
    to_char(v.total_cents / 100.0, 'FM$999,999,990.00') || ' through Stripe. It reaches your bank on Stripe''s payout schedule.',
    '/app/org/' || v.issuer_org_id || '/invoices/' || v.id, null);
  perform app.notify_dispatchers(v.recipient_org_id, 'invoice.paid', v.number || ' paid by card',
    'Your card payment to ' || v_issuer || ' went through.',
    '/app/org/' || v.recipient_org_id || '/invoices/' || v.id, null);
  perform app.log_invoice_event(v, 'invoice.paid', v.number || ' paid by card', '');
  return 'settled';
end;
$$;

-- Processes one verified Stripe event, once. The server has already checked
-- the signature and that it isn't a live-mode event.
create or replace function app.payments_handle_event(p_event_id text, p_type text, p_object jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome text := 'ignored';
begin
  if exists (select 1 from public.stripe_events where event_id = p_event_id) then
    return 'duplicate';
  end if;

  if p_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') then
    if p_object ->> 'payment_status' = 'paid' then
      v_outcome := app.payments_settle(p_object ->> 'id', (p_object ->> 'amount_total')::bigint, p_object ->> 'payment_intent');
    else
      v_outcome := 'awaiting_payment';
    end if;
  elsif p_type in ('checkout.session.expired', 'checkout.session.async_payment_failed') then
    update public.invoice_card_payments set status = 'expired', completed_at = now()
     where checkout_session_id = p_object ->> 'id' and status = 'open';
    v_outcome := case when found then 'expired' else 'unknown_session' end;
  elsif p_type = 'account.updated' then
    update public.stripe_accounts
       set charges_enabled = coalesce((p_object ->> 'charges_enabled')::boolean, false),
           payouts_enabled = coalesce((p_object ->> 'payouts_enabled')::boolean, false),
           details_submitted = coalesce((p_object ->> 'details_submitted')::boolean, false),
           requirements_due = coalesce(jsonb_array_length(p_object -> 'requirements' -> 'currently_due'), 0),
           updated_at = now()
     where stripe_account_id = p_object ->> 'id';
    v_outcome := case when found then 'account_updated' else 'unknown_account' end;
  end if;

  insert into public.stripe_events (event_id, type, outcome) values (p_event_id, p_type, v_outcome);
  return v_outcome;
end;
$$;

revoke all on function public.payout_setup_account(uuid) from public;
revoke all on function public.card_payment_target(uuid) from public;
revoke all on function public.invoice_accepts_cards(uuid) from public;
revoke all on function app.payments_save_account(uuid, text, boolean, boolean, boolean, int, uuid) from public;
revoke all on function app.payments_open_checkout(uuid, text, text, bigint, uuid, timestamptz) from public;
revoke all on function app.payments_settle(text, bigint, text) from public;
revoke all on function app.payments_handle_event(text, text, jsonb) from public;
grant execute on function public.payout_setup_account(uuid) to authenticated;
grant execute on function public.card_payment_target(uuid) to authenticated;
grant execute on function public.invoice_accepts_cards(uuid) to authenticated;
grant execute on function app.payments_save_account(uuid, text, boolean, boolean, boolean, int, uuid) to quickpro_payments;
grant execute on function app.payments_open_checkout(uuid, text, text, bigint, uuid, timestamptz) to quickpro_payments;
grant execute on function app.payments_handle_event(text, text, jsonb) to quickpro_payments;
