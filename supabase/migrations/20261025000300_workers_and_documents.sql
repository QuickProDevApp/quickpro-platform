-- QuickPro foundation: worker profiles and qualification documents.
--
-- Worker profiles describe a person's skills and availability. They say
-- nothing about the legal relationship between a worker and whoever engages
-- them (employee, subcontractor, staffing agency). That relationship is
-- recorded per engagement in a later phase, after legal review. QuickPro does
-- not collect or verify employment eligibility documents here.

create table public.worker_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  headline text not null default '' check (char_length(headline) <= 120),
  bio text not null default '' check (char_length(bio) <= 2000),
  home_service_area_id uuid references public.service_areas (id) on delete set null,
  max_travel_miles int not null default 15 check (max_travel_miles between 0 and 150),
  has_vehicle boolean not null default false,
  has_drivers_license boolean not null default false,
  years_experience int check (years_experience is null or years_experience between 0 and 60),
  desired_hourly_rate_cents int check (
    desired_hourly_rate_cents is null or desired_hourly_rate_cents between 100 and 100000
  ),
  status public.review_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_notes text check (review_notes is null or char_length(review_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index worker_profiles_status_idx on public.worker_profiles (status);

create trigger worker_profiles_touch before update on public.worker_profiles
  for each row execute function app.touch_updated_at();

create table public.worker_skills (
  user_id uuid not null references public.worker_profiles (user_id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

create table public.worker_service_areas (
  user_id uuid not null references public.worker_profiles (user_id) on delete cascade,
  service_area_id uuid not null references public.service_areas (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, service_area_id)
);

-- Weekly recurring availability, in the market's local time (America/New_York).
create table public.worker_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.worker_profiles (user_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index worker_availability_user_idx on public.worker_availability (user_id, weekday);

alter table public.worker_profiles enable row level security;
alter table public.worker_skills enable row level security;
alter table public.worker_service_areas enable row level security;
alter table public.worker_availability enable row level security;

-- Phase 1: a worker profile is visible to the worker and to QuickPro staff
-- only. Contractors will see workers through shift applications (Phase 2).
create policy "workers and admins read worker profiles"
  on public.worker_profiles for select to authenticated
  using (user_id = (select auth.uid()) or app.is_admin());
create policy "users create their own worker profile"
  on public.worker_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "workers update their own profile"
  on public.worker_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on public.worker_profiles to authenticated;
grant insert (
  user_id, headline, bio, home_service_area_id, max_travel_miles,
  has_vehicle, has_drivers_license, years_experience, desired_hourly_rate_cents
) on public.worker_profiles to authenticated;
grant update (
  headline, bio, home_service_area_id, max_travel_miles,
  has_vehicle, has_drivers_license, years_experience, desired_hourly_rate_cents
) on public.worker_profiles to authenticated;

create policy "workers and admins read worker skills"
  on public.worker_skills for select to authenticated
  using (user_id = (select auth.uid()) or app.is_admin());
create policy "workers add own skills"
  on public.worker_skills for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "workers remove own skills"
  on public.worker_skills for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "workers and admins read worker areas"
  on public.worker_service_areas for select to authenticated
  using (user_id = (select auth.uid()) or app.is_admin());
create policy "workers add own areas"
  on public.worker_service_areas for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "workers remove own areas"
  on public.worker_service_areas for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "workers and admins read availability"
  on public.worker_availability for select to authenticated
  using (user_id = (select auth.uid()) or app.is_admin());
create policy "workers add own availability"
  on public.worker_availability for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "workers remove own availability"
  on public.worker_availability for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, delete on public.worker_skills, public.worker_service_areas, public.worker_availability
  to authenticated;
grant insert (user_id, skill_id) on public.worker_skills to authenticated;
grant insert (user_id, service_area_id) on public.worker_service_areas to authenticated;
grant insert (user_id, weekday, start_time, end_time) on public.worker_availability to authenticated;

create trigger audit_worker_profiles after insert or update or delete on public.worker_profiles
  for each row execute function app.audit_row_change('worker_profile', 'user_id', '');
create trigger audit_worker_skills after insert or delete on public.worker_skills
  for each row execute function app.audit_row_change('worker_skill', 'user_id', '');
create trigger audit_worker_service_areas after insert or delete on public.worker_service_areas
  for each row execute function app.audit_row_change('worker_service_area', 'user_id', '');
create trigger audit_worker_availability after insert or delete on public.worker_availability
  for each row execute function app.audit_row_change('worker_availability', 'user_id', '');

create or replace function public.submit_worker_profile_for_review()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.worker_profiles;
  v_missing text[] := '{}';
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  select * into v_profile from public.worker_profiles where user_id = v_user for update;
  if not found then
    raise exception 'Create your worker profile first.' using errcode = 'P0002';
  end if;
  if v_profile.status not in ('draft', 'rejected') then
    raise exception 'Your profile has already been submitted.' using errcode = 'P0001';
  end if;

  if btrim(v_profile.headline) = '' then v_missing := array_append(v_missing, 'a headline'); end if;
  if v_profile.home_service_area_id is null then v_missing := array_append(v_missing, 'your home area'); end if;
  if (select btrim(full_name) from public.profiles where id = v_user) = '' then
    v_missing := array_append(v_missing, 'your full name');
  end if;
  if (select phone from public.profiles where id = v_user) is null then
    v_missing := array_append(v_missing, 'a phone number');
  end if;
  if not exists (select 1 from public.worker_skills where user_id = v_user) then
    v_missing := array_append(v_missing, 'at least one skill');
  end if;
  if not exists (select 1 from public.worker_availability where user_id = v_user) then
    v_missing := array_append(v_missing, 'at least one availability window');
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Add % before submitting.', array_to_string(v_missing, ', ')
      using errcode = 'P0001';
  end if;

  update public.worker_profiles
     set status = 'pending_review', submitted_at = now()
   where user_id = v_user;
end;
$$;

revoke all on function public.submit_worker_profile_for_review() from public;
grant execute on function public.submit_worker_profile_for_review() to authenticated;

create or replace function public.review_worker_profile(
  p_user_id uuid,
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
    raise exception 'Only QuickPro staff can review worker profiles.' using errcode = '42501';
  end if;
  select status into v_status from public.worker_profiles where user_id = p_user_id for update;
  if not found then
    raise exception 'Worker profile not found.' using errcode = 'P0002';
  end if;
  perform app.assert_review_transition(v_status, p_decision, p_notes);

  update public.worker_profiles
     set status = p_decision,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_notes = nullif(btrim(p_notes), '')
   where user_id = p_user_id;
end;
$$;

revoke all on function public.review_worker_profile(uuid, public.review_status, text) from public;
grant execute on function public.review_worker_profile(uuid, public.review_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Qualification documents (certificates of insurance, licenses,
-- certifications). Files live in private storage; this table is the index
-- and the authorization source for downloads.
--
-- A staff review records that a person at QuickPro looked at the document.
-- It is not verification with the insurer or issuing authority.
-- ---------------------------------------------------------------------------
create table public.qualification_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  worker_user_id uuid references public.worker_profiles (user_id) on delete cascade,
  doc_type public.document_type not null,
  title text not null check (char_length(title) between 1 and 160),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique check (storage_path ~ '^(org|worker)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$'),
  expires_on date,
  status public.document_status not null default 'pending',
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text check (review_notes is null or char_length(review_notes) <= 2000),
  created_at timestamptz not null default now(),
  check ((organization_id is null) <> (worker_user_id is null))
);

create index qualification_documents_org_idx on public.qualification_documents (organization_id);
create index qualification_documents_worker_idx on public.qualification_documents (worker_user_id);
create index qualification_documents_status_idx on public.qualification_documents (status);

alter table public.qualification_documents enable row level security;

create policy "owners and admins read documents"
  on public.qualification_documents for select to authenticated
  using (
    app.is_admin()
    or (organization_id is not null and app.is_org_member(organization_id))
    or (worker_user_id is not null and worker_user_id = (select auth.uid()))
  );

create policy "owners upload documents"
  on public.qualification_documents for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (organization_id is not null and app.can_manage_org(organization_id))
      or (worker_user_id is not null and worker_user_id = (select auth.uid()))
    )
  );

-- Approved documents stay on file; owners upload a replacement instead.
create policy "owners delete unapproved documents"
  on public.qualification_documents for delete to authenticated
  using (
    status <> 'approved'
    and (
      (organization_id is not null and app.can_manage_org(organization_id))
      or (worker_user_id is not null and worker_user_id = (select auth.uid()))
    )
  );

grant select, delete on public.qualification_documents to authenticated;
grant insert (
  id, organization_id, worker_user_id, doc_type, title, file_name, mime_type,
  size_bytes, sha256, storage_path, expires_on, uploaded_by
) on public.qualification_documents to authenticated;

create trigger audit_qualification_documents after insert or update or delete on public.qualification_documents
  for each row execute function app.audit_row_change('qualification_document', 'id', 'organization_id');

-- A document counts toward submission while it is pending or approved and
-- not known to be expired.
create or replace function app.org_has_document(p_org_id uuid, p_type public.document_type)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.qualification_documents
    where organization_id = p_org_id
      and doc_type = p_type
      and status in ('pending', 'approved')
      and (expires_on is null or expires_on >= current_date)
  );
$$;

create or replace function public.review_document(
  p_document_id uuid,
  p_decision public.document_status,
  p_notes text,
  p_expires_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.document_status;
begin
  if not app.is_admin() then
    raise exception 'Only QuickPro staff can review documents.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'A review decision must be approved or rejected.' using errcode = 'P0001';
  end if;
  if p_decision = 'rejected' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'A note explaining the rejection is required.' using errcode = 'P0001';
  end if;
  select status into v_status from public.qualification_documents where id = p_document_id for update;
  if not found then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;

  update public.qualification_documents
     set status = p_decision,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_notes = nullif(btrim(p_notes), ''),
         expires_on = coalesce(p_expires_on, expires_on)
   where id = p_document_id;
end;
$$;

revoke all on function public.review_document(uuid, public.document_status, text, date) from public;
grant execute on function public.review_document(uuid, public.document_status, text, date) to authenticated;
