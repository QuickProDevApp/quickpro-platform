-- QuickPro foundation: profiles, organizations, memberships, audit log.
--
-- Security model (see docs/architecture.md, "Authorization"):
--   * Every table has row level security enabled.
--   * The API roles (anon, authenticated) get column-level grants. Columns that
--     carry review state (status, reviewed_by, ...) are never granted, so they
--     can only change through the SECURITY DEFINER workflow functions below.
--   * Every insert, update and delete on a business table is written to
--     public.audit_log by trigger, inside the same transaction.

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, created by trigger on auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9 ().-]{7,20}$'),
  platform_role public.platform_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

create or replace function app.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function app.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- Authorization helpers. SECURITY DEFINER so they can be used inside policies
-- without recursive policy evaluation.
-- ---------------------------------------------------------------------------
create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and platform_role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Organizations: contractor businesses and customer organizations.
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  kind public.organization_kind not null,
  name text not null check (char_length(name) between 2 and 120),
  legal_name text check (legal_name is null or char_length(legal_name) <= 160),
  description text not null default '' check (char_length(description) <= 2000),
  phone text check (phone is null or phone ~ '^\+?[0-9 ().-]{7,20}$'),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website text check (website is null or website ~* '^https?://'),
  address_line1 text check (address_line1 is null or char_length(address_line1) <= 200),
  city text check (city is null or char_length(city) <= 80),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  market_id uuid not null references public.markets (id) on delete restrict,
  years_in_business int check (years_in_business is null or years_in_business between 0 and 150),
  crew_size int check (crew_size is null or crew_size between 1 and 10000),
  status public.review_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_notes text check (review_notes is null or char_length(review_notes) <= 2000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_status_idx on public.organizations (status);
create index organizations_market_idx on public.organizations (market_id);

create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id);

create or replace function app.is_org_member(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_org_id and user_id = (select auth.uid())
  );
$$;

create or replace function app.has_org_role(p_org_id uuid, p_roles public.org_member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_org_id
      and user_id = (select auth.uid())
      and role = any (p_roles)
  );
$$;

create or replace function app.can_manage_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(p_org_id, array['owner', 'admin']::public.org_member_role[]);
$$;

-- Approved organizations may keep editing contact details, but changes to the
-- identity that staff reviewed (name, legal name, market) need staff.
create or replace function app.guard_reviewed_org_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('approved', 'pending_review', 'suspended')
     and not app.is_admin()
     and (new.name is distinct from old.name
          or new.legal_name is distinct from old.legal_name
          or new.market_id is distinct from old.market_id
          or new.kind is distinct from old.kind) then
    raise exception 'The business name, legal name and market can only be changed by QuickPro staff after submission.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger organizations_guard_identity before update on public.organizations
  for each row execute function app.guard_reviewed_org_identity();

-- ---------------------------------------------------------------------------
-- Profiles policy depends on organization_members, so it is defined here.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "users read own profile, co-members and admins read more"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or app.is_admin()
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );

create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Organization policies
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create policy "members and admins read organizations"
  on public.organizations for select to authenticated
  using (app.is_org_member(id) or app.is_admin());

create policy "org managers and admins update organizations"
  on public.organizations for update to authenticated
  using (app.can_manage_org(id) or app.is_admin())
  with check (app.can_manage_org(id) or app.is_admin());

grant select on public.organizations to authenticated;
grant update (
  name, legal_name, description, phone, email, website,
  address_line1, city, postal_code, market_id, years_in_business, crew_size
) on public.organizations to authenticated;

create policy "members and admins read memberships"
  on public.organization_members for select to authenticated
  using (app.is_org_member(organization_id) or app.is_admin());

grant select on public.organization_members to authenticated;

-- ---------------------------------------------------------------------------
-- Contractor capabilities
-- ---------------------------------------------------------------------------
create table public.contractor_services (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid not null references public.service_categories (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (organization_id, category_id)
);

create table public.contractor_service_areas (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_area_id uuid not null references public.service_areas (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (organization_id, service_area_id)
);

create or replace function app.is_contractor_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations where id = p_org_id and kind = 'contractor'
  );
$$;

alter table public.contractor_services enable row level security;
alter table public.contractor_service_areas enable row level security;

create policy "members and admins read contractor services"
  on public.contractor_services for select to authenticated
  using (app.is_org_member(organization_id) or app.is_admin());
create policy "managers add contractor services"
  on public.contractor_services for insert to authenticated
  with check (app.can_manage_org(organization_id) and app.is_contractor_org(organization_id));
create policy "managers remove contractor services"
  on public.contractor_services for delete to authenticated
  using (app.can_manage_org(organization_id));

create policy "members and admins read contractor areas"
  on public.contractor_service_areas for select to authenticated
  using (app.is_org_member(organization_id) or app.is_admin());
create policy "managers add contractor areas"
  on public.contractor_service_areas for insert to authenticated
  with check (app.can_manage_org(organization_id) and app.is_contractor_org(organization_id));
create policy "managers remove contractor areas"
  on public.contractor_service_areas for delete to authenticated
  using (app.can_manage_org(organization_id));

grant select, delete on public.contractor_services, public.contractor_service_areas to authenticated;
grant insert (organization_id, category_id) on public.contractor_services to authenticated;
grant insert (organization_id, service_area_id) on public.contractor_service_areas to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log: append-only. Written by trigger and by workflow functions.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  organization_id uuid,
  changes jsonb not null default '{}'::jsonb,
  db_role text not null -- the API role (authenticated) or the database login for platform operations
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_org_idx on public.audit_log (organization_id, occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, occurred_at desc);
create index audit_log_occurred_idx on public.audit_log (occurred_at desc);

alter table public.audit_log enable row level security;

create policy "admins read audit log"
  on public.audit_log for select to authenticated
  using (app.is_admin());

grant select on public.audit_log to authenticated;

create or replace function app.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_organization_id uuid,
  p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- The actor may have been deleted in the same transaction (account removal).
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, organization_id, changes, db_role)
  values (v_actor, p_action, p_entity_type, p_entity_id, p_organization_id, coalesce(p_changes, '{}'::jsonb),
          coalesce(nullif(current_setting('role', true), 'none'), session_user));
end;
$$;

revoke all on function app.write_audit(text, text, text, uuid, jsonb) from public;

-- Generic row-change trigger.
--   TG_ARGV[0] entity type label, e.g. 'organization'
--   TG_ARGV[1] name of the column holding the entity id
--   TG_ARGV[2] name of the column holding the organization id ('' for none)
create or replace function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity_type text := tg_argv[0];
  v_id_column text := tg_argv[1];
  v_org_column text := nullif(tg_argv[2], '');
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_action text;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> 'updated_at' and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
    if v_changes ? 'status' then
      v_action := v_entity_type || '.status.' || (v_new ->> 'status');
    else
      v_action := v_entity_type || '.updated';
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new - 'updated_at';
    v_action := v_entity_type || '.created';
  else
    v_changes := v_old - 'updated_at';
    v_action := v_entity_type || '.deleted';
  end if;

  perform app.write_audit(
    v_action,
    v_entity_type,
    v_row ->> v_id_column,
    case when v_org_column is not null then (v_row ->> v_org_column)::uuid end,
    v_changes
  );
  return null;
end;
$$;

create trigger audit_profiles after update on public.profiles
  for each row execute function app.audit_row_change('profile', 'id', '');
create trigger audit_organizations after insert or update or delete on public.organizations
  for each row execute function app.audit_row_change('organization', 'id', 'id');
create trigger audit_organization_members after insert or update or delete on public.organization_members
  for each row execute function app.audit_row_change('organization_member', 'user_id', 'organization_id');
create trigger audit_contractor_services after insert or delete on public.contractor_services
  for each row execute function app.audit_row_change('contractor_service', 'category_id', 'organization_id');
create trigger audit_contractor_service_areas after insert or delete on public.contractor_service_areas
  for each row execute function app.audit_row_change('contractor_service_area', 'service_area_id', 'organization_id');

-- ---------------------------------------------------------------------------
-- Organization workflow functions
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(
  p_kind public.organization_kind,
  p_name text,
  p_market_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org_id uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.markets where id = p_market_id and is_active) then
    raise exception 'QuickPro is not open in that market yet.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.organization_members where user_id = v_user and role = 'owner') >= 5 then
    raise exception 'You already own the maximum number of organizations.' using errcode = 'P0001';
  end if;

  insert into public.organizations (kind, name, market_id, created_by)
  values (p_kind, btrim(p_name), p_market_id, v_user)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_user, 'owner');

  return v_org_id;
end;
$$;

revoke all on function public.create_organization(public.organization_kind, text, uuid) from public;
grant execute on function public.create_organization(public.organization_kind, text, uuid) to authenticated;

-- Implemented in the documents migration, where qualification documents exist.
-- Declared here so submit_organization_for_review can reference it.
create or replace function app.org_has_document(p_org_id uuid, p_type public.document_type)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select false; $$;

create or replace function public.submit_organization_for_review(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_missing text[] := '{}';
begin
  if not app.can_manage_org(p_org_id) then
    raise exception 'Only an owner or admin of this organization can submit it.' using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if v_org.status not in ('draft', 'rejected') then
    raise exception 'This organization has already been submitted.' using errcode = 'P0001';
  end if;

  if v_org.phone is null then v_missing := array_append(v_missing, 'business phone'); end if;
  if v_org.email is null then v_missing := array_append(v_missing, 'business email'); end if;

  if v_org.kind = 'contractor' then
    if v_org.legal_name is null then v_missing := array_append(v_missing, 'legal business name'); end if;
    if not exists (select 1 from public.contractor_services where organization_id = p_org_id) then
      v_missing := array_append(v_missing, 'at least one service category');
    end if;
    if not exists (select 1 from public.contractor_service_areas where organization_id = p_org_id) then
      v_missing := array_append(v_missing, 'at least one service area');
    end if;
    if not app.org_has_document(p_org_id, 'general_liability_coi') then
      v_missing := array_append(v_missing, 'a general liability certificate of insurance');
    end if;
  else
    if v_org.address_line1 is null or v_org.city is null or v_org.postal_code is null then
      v_missing := array_append(v_missing, 'business address');
    end if;
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Add % before submitting.', array_to_string(v_missing, ', ')
      using errcode = 'P0001';
  end if;

  update public.organizations
     set status = 'pending_review', submitted_at = now()
   where id = p_org_id;
end;
$$;

revoke all on function public.submit_organization_for_review(uuid) from public;
grant execute on function public.submit_organization_for_review(uuid) to authenticated;

-- Staff decisions. Allowed transitions:
--   pending_review -> approved | rejected
--   approved       -> suspended
--   suspended      -> approved
create or replace function app.assert_review_transition(
  p_from public.review_status,
  p_to public.review_status,
  p_notes text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not (
    (p_from = 'pending_review' and p_to in ('approved', 'rejected'))
    or (p_from = 'approved' and p_to = 'suspended')
    or (p_from = 'suspended' and p_to = 'approved')
  ) then
    raise exception 'Cannot change status from % to %.', p_from, p_to using errcode = 'P0001';
  end if;
  if p_to in ('rejected', 'suspended') and coalesce(btrim(p_notes), '') = '' then
    raise exception 'A note explaining the decision is required.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.review_organization(
  p_org_id uuid,
  p_decision public.review_status,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.review_status;
begin
  if not app.is_admin() then
    raise exception 'Only QuickPro staff can review organizations.' using errcode = '42501';
  end if;
  select status into v_status from public.organizations where id = p_org_id for update;
  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  perform app.assert_review_transition(v_status, p_decision, p_notes);

  update public.organizations
     set status = p_decision,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_notes = nullif(btrim(p_notes), '')
   where id = p_org_id;
end;
$$;

revoke all on function public.review_organization(uuid, public.review_status, text) from public;
grant execute on function public.review_organization(uuid, public.review_status, text) to authenticated;
