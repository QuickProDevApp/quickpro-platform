-- Customer service requests and contractor quotes.
--
-- An approved customer organization posts a request for work (category,
-- town, preferred dates, optional budget). Approved contractors that serve
-- that category and town, or that the customer invited, see it and quote.
-- The customer accepts one quote, which awards the request; the other
-- quotes are declined. The street address and access notes are shared only
-- with the customer, staff and the awarded contractor. Quotes from other
-- contractors are never visible to each other.
--
-- Quoting needs the same standing as staffing: an approved contractor with a
-- staff-reviewed, unexpired general liability certificate. No money moves
-- here; invoices and payments come later.

create type public.request_status as enum ('open', 'awarded', 'completed', 'cancelled');
create type public.quote_status as enum ('submitted', 'withdrawn', 'accepted', 'declined');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 4000),
  category_id uuid not null references public.service_categories (id) on delete restrict,
  service_area_id uuid not null references public.service_areas (id) on delete restrict,
  preferred_start date not null,
  preferred_end date,
  budget_min_cents int check (budget_min_cents is null or budget_min_cents between 100 and 100000000),
  budget_max_cents int check (budget_max_cents is null or budget_max_cents between 100 and 100000000),
  status public.request_status not null default 'open',
  created_by uuid not null references public.profiles (id) on delete restrict,
  awarded_quote_id uuid,
  awarded_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (preferred_end is null or preferred_end >= preferred_start),
  check (budget_min_cents is null or budget_max_cents is null or budget_max_cents >= budget_min_cents)
);

create index service_requests_org_idx on public.service_requests (organization_id, created_at desc);
create index service_requests_open_idx on public.service_requests (category_id, service_area_id) where status = 'open';

create trigger service_requests_touch before update on public.service_requests
  for each row execute function app.touch_updated_at();

create table public.service_request_sites (
  request_id uuid primary key references public.service_requests (id) on delete cascade,
  address_line1 text not null check (char_length(address_line1) between 3 and 200),
  city text not null check (char_length(city) between 2 and 80),
  postal_code text not null check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  access_notes text not null default '' check (char_length(access_notes) <= 1000),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_phone text not null check (contact_phone ~ '^\+?[0-9 ().-]{7,20}$'),
  updated_at timestamptz not null default now()
);

create trigger service_request_sites_touch before update on public.service_request_sites
  for each row execute function app.touch_updated_at();

-- Contractors the customer asked to quote, whether or not they list the category and town.
create table public.service_request_invitations (
  request_id uuid not null references public.service_requests (id) on delete cascade,
  contractor_id uuid not null references public.organizations (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (request_id, contractor_id)
);

create index service_request_invitations_contractor_idx on public.service_request_invitations (contractor_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  contractor_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.organizations (id) on delete cascade,
  amount_cents int not null check (amount_cents between 100 and 100000000),
  scope text not null check (char_length(scope) between 10 and 4000),
  estimated_start date,
  valid_until date not null,
  status public.quote_status not null default 'submitted',
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, contractor_id)
);

create index quotes_contractor_idx on public.quotes (contractor_id, submitted_at desc);

create trigger quotes_touch before update on public.quotes
  for each row execute function app.touch_updated_at();

alter table public.service_requests
  add constraint service_requests_awarded_quote_fk foreign key (awarded_quote_id) references public.quotes (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------

-- Contractor organizations the current user can quote for (owner, admin, dispatcher).
create or replace function app.my_dispatch_contractors()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'dispatcher')
    and o.kind = 'contractor' and o.status = 'approved';
$$;

-- An approved contractor may see an open request it serves (category and
-- town) or was invited to, and any request it has quoted on.
create or replace function app.contractor_can_see_request(p_request_id uuid, p_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.quotes q where q.request_id = p_request_id and q.contractor_id = p_contractor_id)
      or exists (
        select 1 from public.service_requests r
        join public.organizations c on c.id = p_contractor_id and c.kind = 'contractor' and c.status = 'approved'
        where r.id = p_request_id and r.status = 'open'
          and (
            exists (select 1 from public.service_request_invitations i where i.request_id = r.id and i.contractor_id = c.id)
            or (exists (select 1 from public.contractor_services s where s.organization_id = c.id and s.category_id = r.category_id)
                and exists (select 1 from public.contractor_service_areas a where a.organization_id = c.id and a.service_area_id = r.service_area_id))
          )
      );
$$;

create or replace function app.can_see_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin()
      or exists (select 1 from public.service_requests r where r.id = p_request_id and app.is_org_member(r.organization_id))
      or exists (
        select 1 from public.organization_members m
        where m.user_id = (select auth.uid()) and app.contractor_can_see_request(p_request_id, m.organization_id)
      );
$$;

-- The customer, staff and members of the contractor whose quote was accepted.
create or replace function app.can_see_request_site(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin()
      or exists (
        select 1 from public.service_requests r
        left join public.quotes q on q.id = r.awarded_quote_id
        where r.id = p_request_id
          and (app.is_org_member(r.organization_id) or (q.contractor_id is not null and app.is_org_member(q.contractor_id)))
      );
$$;

alter table public.service_requests enable row level security;
alter table public.service_request_sites enable row level security;
alter table public.service_request_invitations enable row level security;
alter table public.quotes enable row level security;

create policy "customers, matching contractors and staff read requests"
  on public.service_requests for select to authenticated
  using (app.is_org_member(organization_id) or app.can_see_request(id));
create policy "customer dispatchers post requests"
  on public.service_requests for insert to authenticated
  with check (app.can_dispatch(organization_id) and created_by = (select auth.uid()));
create policy "customer dispatchers edit open requests"
  on public.service_requests for update to authenticated
  using (app.can_dispatch(organization_id) and status = 'open')
  with check (app.can_dispatch(organization_id));

grant select on public.service_requests to authenticated;
grant insert (organization_id, title, description, category_id, service_area_id, preferred_start, preferred_end,
              budget_min_cents, budget_max_cents, created_by)
  on public.service_requests to authenticated;
grant update (title, description, category_id, service_area_id, preferred_start, preferred_end, budget_min_cents, budget_max_cents)
  on public.service_requests to authenticated;

create policy "customer, awarded contractor and staff read request sites"
  on public.service_request_sites for select to authenticated
  using (app.can_see_request_site(request_id));
create policy "customer dispatchers add request sites"
  on public.service_request_sites for insert to authenticated
  with check (exists (select 1 from public.service_requests r where r.id = request_id and app.can_dispatch(r.organization_id)));
create policy "customer dispatchers edit request sites"
  on public.service_request_sites for update to authenticated
  using (exists (select 1 from public.service_requests r where r.id = request_id and app.can_dispatch(r.organization_id)
                 and r.status in ('open', 'awarded')))
  with check (exists (select 1 from public.service_requests r where r.id = request_id and app.can_dispatch(r.organization_id)));

grant select on public.service_request_sites to authenticated;
grant insert (request_id, address_line1, city, postal_code, access_notes, contact_name, contact_phone)
  on public.service_request_sites to authenticated;
grant update (address_line1, city, postal_code, access_notes, contact_name, contact_phone)
  on public.service_request_sites to authenticated;

create policy "customer, invited contractor and staff read invitations"
  on public.service_request_invitations for select to authenticated
  using (
    app.is_admin() or app.is_org_member(contractor_id)
    or exists (select 1 from public.service_requests r where r.id = request_id and app.is_org_member(r.organization_id))
  );
grant select on public.service_request_invitations to authenticated;

-- Each side sees its own quotes; the customer sees every quote on its requests.
create policy "customer, quoting contractor and staff read quotes"
  on public.quotes for select to authenticated
  using (app.is_admin() or app.is_org_member(contractor_id) or app.is_org_member(customer_id));
grant select on public.quotes to authenticated;

-- ---------------------------------------------------------------------------
-- Request rules
-- ---------------------------------------------------------------------------
create or replace function app.check_service_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations where id = new.organization_id;
  if tg_op = 'INSERT' then
    if v_org.kind <> 'customer' then
      raise exception 'Only customer organizations can request service.' using errcode = 'P0001';
    end if;
    if v_org.status <> 'approved' then
      raise exception 'Your organization must be approved by QuickPro staff before it can request service.' using errcode = 'P0001';
    end if;
  else
    if new.organization_id is distinct from old.organization_id then
      raise exception 'A request cannot move to another organization.' using errcode = 'P0001';
    end if;
    -- Workflow functions change the status; people edit only open requests.
    if old.status <> 'open' and new.status is not distinct from old.status and not app.is_admin() then
      raise exception 'This request is % and can no longer be edited.', old.status using errcode = 'P0001';
    end if;
  end if;

  if (tg_op = 'INSERT' or new.preferred_start is distinct from old.preferred_start)
     and new.preferred_start < (now() at time zone 'America/New_York')::date then
    raise exception 'The preferred start date can''t be in the past.' using errcode = 'P0001';
  end if;
  if (tg_op = 'INSERT' or new.preferred_start is distinct from old.preferred_start)
     and new.preferred_start > (now() at time zone 'America/New_York')::date + 365 then
    raise exception 'Requests can be posted up to a year ahead.' using errcode = 'P0001';
  end if;
  if (tg_op = 'INSERT' or new.service_area_id is distinct from old.service_area_id) and not exists (
    select 1 from public.service_areas a join public.markets m on m.id = a.market_id
    where a.id = new.service_area_id and a.market_id = v_org.market_id and m.is_active
  ) then
    raise exception 'Choose a town in your organization''s market.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger service_requests_check before insert or update on public.service_requests
  for each row execute function app.check_service_request();

-- ---------------------------------------------------------------------------
-- Workflow functions
-- ---------------------------------------------------------------------------
create or replace function public.invite_contractor_to_quote(p_request_id uuid, p_contractor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
begin
  select * into v_req from public.service_requests where id = p_request_id;
  if not found or not app.can_dispatch(v_req.organization_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'open' then
    raise exception 'This request is no longer taking quotes.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.organizations c join public.organizations me on me.id = v_req.organization_id
    where c.id = p_contractor_id and c.kind = 'contractor' and c.status = 'approved' and c.market_id = me.market_id
  ) then
    raise exception 'That contractor is not available on QuickPro in your market.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.service_request_invitations where request_id = p_request_id) >= 20 then
    raise exception 'A request can invite up to 20 contractors.' using errcode = 'P0001';
  end if;
  insert into public.service_request_invitations (request_id, contractor_id, invited_by)
  values (p_request_id, p_contractor_id, auth.uid())
  on conflict do nothing;
end;
$$;

-- Submits a quote, or revises the contractor's quote while the request is open.
create or replace function public.submit_quote(
  p_request_id uuid, p_contractor_id uuid, p_amount_cents int, p_scope text, p_estimated_start date, p_valid_until date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
  v_quote public.quotes;
  v_id uuid;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if not app.can_dispatch(p_contractor_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found or not app.contractor_can_see_request(p_request_id, p_contractor_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'open' then
    raise exception 'This request is no longer taking quotes.' using errcode = 'P0001';
  end if;
  perform app.assert_contractor_can_staff(p_contractor_id);
  if coalesce(btrim(p_scope), '') = '' or char_length(btrim(p_scope)) < 10 then
    raise exception 'Describe what the quote includes in a sentence or two.' using errcode = 'P0001';
  end if;
  if p_valid_until is null or p_valid_until < v_today then
    raise exception 'The quote must be valid until today or later.' using errcode = 'P0001';
  end if;
  if p_valid_until > v_today + 180 then
    raise exception 'Quotes can be valid for up to 180 days.' using errcode = 'P0001';
  end if;
  if p_estimated_start is not null and p_estimated_start < v_today then
    raise exception 'The estimated start date can''t be in the past.' using errcode = 'P0001';
  end if;

  select * into v_quote from public.quotes where request_id = p_request_id and contractor_id = p_contractor_id for update;
  if found then
    if v_quote.status in ('accepted', 'declined') then
      raise exception 'The customer already decided on this quote.' using errcode = 'P0001';
    end if;
    update public.quotes
       set amount_cents = p_amount_cents, scope = btrim(p_scope), estimated_start = p_estimated_start,
           valid_until = p_valid_until, status = 'submitted', submitted_by = auth.uid(), submitted_at = now(),
           revision = revision + 1
     where id = v_quote.id
     returning id into v_id;
  else
    insert into public.quotes (request_id, contractor_id, customer_id, amount_cents, scope, estimated_start, valid_until, submitted_by)
    values (p_request_id, p_contractor_id, v_req.organization_id, p_amount_cents, btrim(p_scope), p_estimated_start, p_valid_until, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.withdraw_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found or not app.can_dispatch(v_quote.contractor_id) then
    raise exception 'Quote not found.' using errcode = 'P0002';
  end if;
  if v_quote.status <> 'submitted' then
    raise exception 'Only a quote waiting for the customer can be withdrawn.' using errcode = 'P0001';
  end if;
  update public.quotes set status = 'withdrawn', decided_at = now() where id = p_quote_id;
end;
$$;

create or replace function public.decline_quote(p_quote_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found or not app.can_dispatch(v_quote.customer_id) then
    raise exception 'Quote not found.' using errcode = 'P0002';
  end if;
  if v_quote.status <> 'submitted' then
    raise exception 'This quote is already %.', v_quote.status using errcode = 'P0001';
  end if;
  update public.quotes
     set status = 'declined', decided_at = now(), decision_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '')
   where id = p_quote_id;
end;
$$;

-- Accepting a quote awards the request; every other open quote is declined.
create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_req public.service_requests;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found or not app.can_dispatch(v_quote.customer_id) then
    raise exception 'Quote not found.' using errcode = 'P0002';
  end if;
  select * into v_req from public.service_requests where id = v_quote.request_id for update;
  if v_req.status <> 'open' then
    raise exception 'This request is already %.', v_req.status using errcode = 'P0001';
  end if;
  if v_quote.status <> 'submitted' then
    raise exception 'This quote is %; only a submitted quote can be accepted.', v_quote.status using errcode = 'P0001';
  end if;
  if v_quote.valid_until < (now() at time zone 'America/New_York')::date then
    raise exception 'This quote expired on %. Ask the contractor to revise it.', to_char(v_quote.valid_until, 'Mon FMDD, YYYY')
      using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.organizations where id = v_quote.contractor_id and status = 'approved') then
    raise exception 'This contractor is no longer approved on QuickPro.' using errcode = 'P0001';
  end if;

  update public.quotes set status = 'accepted', decided_at = now() where id = p_quote_id;
  update public.quotes
     set status = 'declined', decided_at = now(), decision_note = 'The customer accepted another quote.'
   where request_id = v_req.id and id <> p_quote_id and status = 'submitted';
  update public.service_requests
     set status = 'awarded', awarded_quote_id = p_quote_id, awarded_at = now()
   where id = v_req.id;
end;
$$;

create or replace function public.cancel_service_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found or not (app.can_dispatch(v_req.organization_id) or app.is_admin()) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status not in ('open', 'awarded') then
    raise exception 'This request is already %.', v_req.status using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Add a short reason so the contractors know why.' using errcode = 'P0001';
  end if;
  update public.quotes
     set status = 'declined', decided_at = now(), decision_note = 'Request cancelled: ' || left(btrim(p_reason), 900)
   where request_id = p_request_id and status = 'submitted';
  update public.service_requests
     set status = 'cancelled', cancelled_at = now(), cancel_reason = left(btrim(p_reason), 1000)
   where id = p_request_id;
end;
$$;

create or replace function public.complete_service_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found or not (app.can_dispatch(v_req.organization_id) or app.is_admin()) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'awarded' then
    raise exception 'Only awarded work can be marked complete.' using errcode = 'P0001';
  end if;
  update public.service_requests set status = 'completed', completed_at = now() where id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contractor directory for customers
-- ---------------------------------------------------------------------------
-- Approved contractors in the customer's market with the public parts of
-- their profile. Only members of approved customer organizations and staff
-- can browse it.
create or replace function public.contractor_directory(p_customer_id uuid, p_category_id uuid, p_area_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  years_in_business int,
  crew_size int,
  website text,
  category_names text[],
  area_names text[],
  serves_category boolean,
  serves_area boolean,
  insurance_reviewed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_market uuid;
begin
  select market_id into v_market from public.organizations
   where organizations.id = p_customer_id and kind = 'customer' and status = 'approved';
  if v_market is null or not (app.is_org_member(p_customer_id) or app.is_admin()) then
    raise exception 'Your organization must be approved by QuickPro staff before it can browse contractors.' using errcode = 'P0001';
  end if;
  return query
  select o.id, o.name, o.description, o.years_in_business, o.crew_size, o.website,
         coalesce((select array_agg(c.name order by c.sort_order) from public.contractor_services s
                   join public.service_categories c on c.id = s.category_id where s.organization_id = o.id), '{}'),
         coalesce((select array_agg(a.name order by a.name) from public.contractor_service_areas sa
                   join public.service_areas a on a.id = sa.service_area_id where sa.organization_id = o.id), '{}'),
         p_category_id is not null and exists (select 1 from public.contractor_services s where s.organization_id = o.id and s.category_id = p_category_id),
         p_area_id is not null and exists (select 1 from public.contractor_service_areas sa where sa.organization_id = o.id and sa.service_area_id = p_area_id),
         app.org_has_reviewed_insurance(o.id)
  from public.organizations o
  where o.kind = 'contractor' and o.status = 'approved' and o.market_id = v_market
    and (p_category_id is null or exists (select 1 from public.contractor_services s where s.organization_id = o.id and s.category_id = p_category_id))
    and (p_area_id is null or exists (select 1 from public.contractor_service_areas sa where sa.organization_id = o.id and sa.service_area_id = p_area_id))
  order by o.name;
end;
$$;

-- Names of the organizations on either side of a request, for people who can see it.
create or replace function public.request_party_names(p_request_id uuid)
returns table (organization_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.name from public.service_requests r join public.organizations o on o.id = r.organization_id
   where r.id = p_request_id and app.can_see_request(p_request_id)
  union
  select o.id, o.name from public.quotes q join public.organizations o on o.id = q.contractor_id
   where q.request_id = p_request_id and (app.is_admin() or app.is_org_member(q.customer_id) or app.is_org_member(q.contractor_id));
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function app.notify_request_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_customer text;
  v_quote public.quotes;
begin
  select name into v_customer from public.organizations where id = new.organization_id;
  if tg_op = 'INSERT' then
    -- Contractors that serve the category and town hear about new work.
    for v_org in
      select o.id from public.organizations o
      where o.kind = 'contractor' and o.status = 'approved'
        and exists (select 1 from public.contractor_services s where s.organization_id = o.id and s.category_id = new.category_id)
        and exists (select 1 from public.contractor_service_areas a where a.organization_id = o.id and a.service_area_id = new.service_area_id)
    loop
      perform app.notify_dispatchers(v_org, 'request.new', 'New request: ' || new.title,
        v_customer || ' is asking for quotes.', '/app/org/' || v_org || '/requests/' || new.id, null);
    end loop;
    return null;
  end if;
  if new.status is not distinct from old.status then
    return null;
  end if;
  if new.status = 'cancelled' then
    -- The customer's other dispatchers, or all of them when staff cancel.
    perform app.notify_dispatchers(new.organization_id, 'request.cancelled', 'Request cancelled: ' || new.title,
      coalesce(new.cancel_reason, ''), '/app/org/' || new.organization_id || '/requests/' || new.id, null);
    for v_quote in select * from public.quotes where request_id = new.id and status in ('declined', 'withdrawn', 'accepted', 'submitted') loop
      perform app.notify_dispatchers(v_quote.contractor_id, 'request.cancelled', 'Request cancelled: ' || new.title,
        coalesce(new.cancel_reason, ''), '/app/org/' || v_quote.contractor_id || '/requests/' || new.id, null);
    end loop;
  elsif new.status = 'completed' then
    select * into v_quote from public.quotes where id = new.awarded_quote_id;
    if found then
      perform app.notify_dispatchers(v_quote.contractor_id, 'request.completed', new.title || ' is marked complete',
        v_customer || ' marked the work complete.', '/app/org/' || v_quote.contractor_id || '/requests/' || new.id, null);
    end if;
  end if;
  return null;
end;
$$;

create trigger notify_service_requests after insert or update of status on public.service_requests
  for each row execute function app.notify_request_change();

create or replace function app.notify_invitation_to_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
  v_customer text;
begin
  select * into v_req from public.service_requests where id = new.request_id;
  select name into v_customer from public.organizations where id = v_req.organization_id;
  perform app.notify_dispatchers(new.contractor_id, 'request.invited', v_customer || ' asked you to quote',
    v_req.title, '/app/org/' || new.contractor_id || '/requests/' || v_req.id, null);
  return null;
end;
$$;

create trigger notify_service_request_invitations after insert on public.service_request_invitations
  for each row execute function app.notify_invitation_to_quote();

create or replace function app.notify_quote_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
  v_contractor text;
  v_customer_link text;
  v_contractor_link text;
  v_amount text := to_char(new.amount_cents / 100.0, 'FM$999,999,990.00');
begin
  select * into v_req from public.service_requests where id = new.request_id;
  select name into v_contractor from public.organizations where id = new.contractor_id;
  v_customer_link := '/app/org/' || new.customer_id || '/requests/' || new.request_id;
  v_contractor_link := '/app/org/' || new.contractor_id || '/requests/' || new.request_id;

  if tg_op = 'INSERT' or (new.status = 'submitted' and new.revision is distinct from old.revision) then
    perform app.notify_dispatchers(new.customer_id,
      case when tg_op = 'INSERT' then 'quote.received' else 'quote.revised' end,
      case when tg_op = 'INSERT' then 'New quote from ' else 'Revised quote from ' end || v_contractor,
      v_amount || ' for ' || v_req.title, v_customer_link, null);
    return null;
  end if;
  if new.status is not distinct from old.status then
    return null;
  end if;
  case new.status
    when 'withdrawn' then
      perform app.notify_dispatchers(new.customer_id, 'quote.withdrawn', v_contractor || ' withdrew their quote',
        v_req.title, v_customer_link, null);
    when 'accepted' then
      perform app.notify_dispatchers(new.contractor_id, 'quote.accepted', 'Quote accepted: ' || v_req.title,
        v_amount || '. The site address and contact are now on the request.', v_contractor_link, null);
    when 'declined' then
      -- A cancelled request sends its own notification.
      if v_req.status <> 'cancelled' and coalesce(new.decision_note, '') not like 'Request cancelled:%' then
        perform app.notify_dispatchers(new.contractor_id, 'quote.declined', 'Quote not accepted: ' || v_req.title,
          coalesce(new.decision_note, ''), v_contractor_link, null);
      end if;
    else
      null;
  end case;
  return null;
end;
$$;

create trigger notify_quotes after insert or update on public.quotes
  for each row execute function app.notify_quote_change();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_service_requests after insert or update or delete on public.service_requests
  for each row execute function app.audit_row_change('service_request', 'id', 'organization_id');
create trigger audit_service_request_sites after insert or update or delete on public.service_request_sites
  for each row execute function app.audit_row_change('service_request_site', 'request_id', '');
create trigger audit_service_request_invitations after insert or delete on public.service_request_invitations
  for each row execute function app.audit_row_change('service_request_invitation', 'request_id', 'contractor_id');
create trigger audit_quotes after insert or update or delete on public.quotes
  for each row execute function app.audit_row_change('quote', 'id', 'contractor_id');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function app.my_dispatch_contractors() from public;
revoke all on function app.contractor_can_see_request(uuid, uuid) from public;
revoke all on function app.can_see_request(uuid) from public;
revoke all on function app.can_see_request_site(uuid) from public;
revoke all on function app.check_service_request() from public;
revoke all on function app.notify_request_change() from public;
revoke all on function app.notify_invitation_to_quote() from public;
revoke all on function app.notify_quote_change() from public;
grant execute on function app.my_dispatch_contractors() to authenticated;
grant execute on function app.contractor_can_see_request(uuid, uuid) to authenticated;
grant execute on function app.can_see_request(uuid) to authenticated;
grant execute on function app.can_see_request_site(uuid) to authenticated;

revoke all on function public.invite_contractor_to_quote(uuid, uuid) from public;
revoke all on function public.submit_quote(uuid, uuid, int, text, date, date) from public;
revoke all on function public.withdraw_quote(uuid) from public;
revoke all on function public.decline_quote(uuid, text) from public;
revoke all on function public.accept_quote(uuid) from public;
revoke all on function public.cancel_service_request(uuid, text) from public;
revoke all on function public.complete_service_request(uuid) from public;
revoke all on function public.contractor_directory(uuid, uuid, uuid) from public;
revoke all on function public.request_party_names(uuid) from public;
grant execute on function public.invite_contractor_to_quote(uuid, uuid) to authenticated;
grant execute on function public.submit_quote(uuid, uuid, int, text, date, date) to authenticated;
grant execute on function public.withdraw_quote(uuid) to authenticated;
grant execute on function public.decline_quote(uuid, text) to authenticated;
grant execute on function public.accept_quote(uuid) to authenticated;
grant execute on function public.cancel_service_request(uuid, text) to authenticated;
grant execute on function public.complete_service_request(uuid) to authenticated;
grant execute on function public.contractor_directory(uuid, uuid, uuid) to authenticated;
grant execute on function public.request_party_names(uuid) to authenticated;
