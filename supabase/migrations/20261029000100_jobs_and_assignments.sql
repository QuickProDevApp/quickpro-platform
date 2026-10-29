-- Phase 2: jobs (staffing requests), applications, assignments and tracking.
--
--   A contractor posts a job: what, where (a town in its market), when, how
--   many people, the hourly pay and the engagement type (who engages the
--   worker and on what basis, decisions.md D-009 and D-016).
--   Approved workers find open jobs and apply.
--   The contractor (or QuickPro staff, matching by hand) offers the job to a
--   worker; the worker accepts or declines. Accepted assignments fill the job.
--   On the day, workers check in and out; the contractor marks the job done.
--
-- Same rules as Phase 1: RLS on every table, column-level grants, status
-- columns only change in SECURITY DEFINER functions, audit by trigger.

-- ---------------------------------------------------------------------------
-- Reference data: engagement types and the pay floor per market
-- ---------------------------------------------------------------------------
create table public.engagement_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);

alter table public.engagement_types enable row level security;
create policy "reference data is readable" on public.engagement_types for select using (true);
grant select on public.engagement_types to anon, authenticated;

-- Wording to be confirmed by counsel before launch (decisions.md D-016).
-- Staff can switch a type off with is_active; jobs keep the type they used.
insert into public.engagement_types (slug, name, description, sort_order) values
  ('contractor-employee', 'Employee of the contractor',
   'The contractor hires you as its employee for this job (W-2). It runs payroll and is responsible for taxes, workers'' compensation and confirming your eligibility to work.', 1),
  ('contractor-subcontractor', 'Independent subcontractor',
   'You do this job for the contractor as your own independent business (1099). You are responsible for your own taxes, insurance and tools.', 2);

-- Lowest hourly pay a job in the market may offer. New York's minimum wage
-- for Long Island in 2026 is $17.00; update this row when the rate changes.
alter table public.markets add column min_hourly_pay_cents int
  check (min_hourly_pay_cents is null or min_hourly_pay_cents > 0);
update public.markets set min_hourly_pay_cents = 1700
 where slug in ('suffolk-county-ny', 'nassau-county-ny');

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.job_status as enum (
  'open',       -- accepting applications
  'filled',     -- accepted assignments = headcount; reopens if one is cancelled
  'completed',  -- marked done by the contractor after it started
  'cancelled'
);

create type public.application_status as enum (
  'applied',
  'offered',    -- the contractor offered the job; see job_assignments
  'declined',   -- the contractor passed
  'withdrawn'   -- the worker withdrew
);

create type public.assignment_status as enum (
  'offered',
  'accepted',
  'declined',   -- the worker declined the offer
  'cancelled',  -- cancelled by either side, or the offer lapsed
  'completed'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.can_dispatch(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_org_role(p_org_id, array['owner', 'admin', 'dispatcher']::public.org_member_role[]);
$$;

create or replace function app.is_approved_worker(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.worker_profiles where user_id = p_user_id and status = 'approved');
$$;

-- The bar for a contractor to post or offer work: approved by staff, with a
-- staff-reviewed general liability certificate that has not expired. This is
-- also how a lapsed certificate stops new work (phase-1-status.md, gaps).
create or replace function app.assert_contractor_can_staff(p_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations where id = p_org_id;
  if not found or v_org.kind <> 'contractor' then
    raise exception 'Only contractor businesses can post jobs.' using errcode = 'P0001';
  end if;
  if v_org.status <> 'approved' then
    raise exception 'Your business must be approved by QuickPro staff before it can post or offer jobs.'
      using errcode = 'P0001';
  end if;
  if not app.org_has_reviewed_insurance(p_org_id) then
    raise exception 'Your general liability certificate has expired or has not been reviewed. Upload a current certificate to post or offer jobs.'
      using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  category_id uuid not null references public.service_categories (id) on delete restrict,
  service_area_id uuid not null references public.service_areas (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  headcount int not null check (headcount between 1 and 50),
  pay_rate_cents int not null check (pay_rate_cents between 100 and 100000),
  engagement_type_id uuid not null references public.engagement_types (id) on delete restrict,
  status public.job_status not null default 'open',
  created_by uuid not null references public.profiles (id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '16 hours')
);

create index jobs_org_idx on public.jobs (organization_id, starts_at desc);
create index jobs_open_idx on public.jobs (starts_at) where status = 'open';
create index jobs_area_idx on public.jobs (service_area_id);

create trigger jobs_touch before update on public.jobs
  for each row execute function app.touch_updated_at();

-- Skills the contractor is looking for. Workers without them can still apply;
-- the contractor sees how each applicant matches.
create table public.job_skills (
  job_id uuid not null references public.jobs (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete restrict,
  primary key (job_id, skill_id)
);

-- Where to show up and who to ask for. Visible to the contractor, staff and
-- workers with an accepted assignment only; everyone else sees the town.
create table public.job_sites (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  address_line1 text not null check (char_length(address_line1) between 3 and 200),
  city text not null check (char_length(city) between 2 and 80),
  postal_code text not null check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  site_notes text not null default '' check (char_length(site_notes) <= 1000),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_phone text not null check (contact_phone ~ '^\+?[0-9 ().-]{7,20}$'),
  updated_at timestamptz not null default now()
);

create trigger job_sites_touch before update on public.job_sites
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Applications and assignments
-- ---------------------------------------------------------------------------
create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  worker_user_id uuid not null references public.worker_profiles (user_id) on delete cascade,
  note text not null default '' check (char_length(note) <= 1000),
  status public.application_status not null default 'applied',
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (job_id, worker_user_id)
);

create index job_applications_worker_idx on public.job_applications (worker_user_id, created_at desc);

create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  worker_user_id uuid not null references public.worker_profiles (user_id) on delete cascade,
  application_id uuid references public.job_applications (id) on delete set null,
  status public.assignment_status not null default 'offered',
  offered_by uuid references public.profiles (id) on delete set null,
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, worker_user_id),
  check (checked_out_at is null or (checked_in_at is not null and checked_out_at >= checked_in_at))
);

create index job_assignments_worker_idx on public.job_assignments (worker_user_id, status);
create index job_assignments_job_idx on public.job_assignments (job_id, status);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.jobs enable row level security;
alter table public.job_skills enable row level security;
alter table public.job_sites enable row level security;
alter table public.job_applications enable row level security;
alter table public.job_assignments enable row level security;

create or replace function app.worker_is_on_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.job_applications where job_id = p_job_id and worker_user_id = (select auth.uid()))
      or exists (select 1 from public.job_assignments where job_id = p_job_id and worker_user_id = (select auth.uid()));
$$;

create or replace function app.worker_accepted_on_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.job_assignments
    where job_id = p_job_id and worker_user_id = (select auth.uid()) and status in ('accepted', 'completed')
  );
$$;

-- Organization members and staff see the organization's jobs. Approved
-- workers see open jobs that have not started, and any job they applied to
-- or were offered.
create policy "members, staff and workers read jobs"
  on public.jobs for select to authenticated
  using (
    app.is_org_member(organization_id)
    or app.is_admin()
    or (status = 'open' and starts_at > now() and app.is_approved_worker((select auth.uid())))
    or app.worker_is_on_job(id)
  );

create policy "dispatchers post jobs"
  on public.jobs for insert to authenticated
  with check (app.can_dispatch(organization_id) and created_by = (select auth.uid()));

create policy "dispatchers edit jobs"
  on public.jobs for update to authenticated
  using (app.can_dispatch(organization_id))
  with check (app.can_dispatch(organization_id));

grant select on public.jobs to authenticated;
grant insert (
  organization_id, title, description, category_id, service_area_id, starts_at, ends_at,
  headcount, pay_rate_cents, engagement_type_id, created_by
) on public.jobs to authenticated;
grant update (
  title, description, category_id, service_area_id, starts_at, ends_at,
  headcount, pay_rate_cents, engagement_type_id
) on public.jobs to authenticated;

-- Readable by anyone who can read the job (the subquery runs under the jobs policy).
create policy "job readers read job skills"
  on public.job_skills for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id));
create policy "dispatchers add job skills"
  on public.job_skills for insert to authenticated
  with check (exists (select 1 from public.jobs j where j.id = job_id and app.can_dispatch(j.organization_id) and j.status = 'open'));
create policy "dispatchers remove job skills"
  on public.job_skills for delete to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and app.can_dispatch(j.organization_id) and j.status = 'open'));

grant select, delete on public.job_skills to authenticated;
grant insert (job_id, skill_id) on public.job_skills to authenticated;

create policy "members, staff and crew read job sites"
  on public.job_sites for select to authenticated
  using (
    app.is_admin()
    or app.worker_accepted_on_job(job_id)
    or exists (select 1 from public.jobs j where j.id = job_id and app.is_org_member(j.organization_id))
  );
create policy "dispatchers add job sites"
  on public.job_sites for insert to authenticated
  with check (exists (select 1 from public.jobs j where j.id = job_id and app.can_dispatch(j.organization_id)));
create policy "dispatchers edit job sites"
  on public.job_sites for update to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and app.can_dispatch(j.organization_id)
                 and j.status in ('open', 'filled')))
  with check (exists (select 1 from public.jobs j where j.id = job_id and app.can_dispatch(j.organization_id)));

grant select on public.job_sites to authenticated;
grant insert (job_id, address_line1, city, postal_code, site_notes, contact_name, contact_phone)
  on public.job_sites to authenticated;
grant update (address_line1, city, postal_code, site_notes, contact_name, contact_phone)
  on public.job_sites to authenticated;

-- Applications and assignments change only through the functions below.
create policy "workers, members and staff read applications"
  on public.job_applications for select to authenticated
  using (worker_user_id = (select auth.uid()) or app.is_org_member(organization_id) or app.is_admin());
grant select on public.job_applications to authenticated;

create policy "workers, members and staff read assignments"
  on public.job_assignments for select to authenticated
  using (worker_user_id = (select auth.uid()) or app.is_org_member(organization_id) or app.is_admin());
grant select on public.job_assignments to authenticated;

-- ---------------------------------------------------------------------------
-- Job rules (triggers): area in the contractor's market, timing, pay floor,
-- and what may change once people are booked.
-- ---------------------------------------------------------------------------
create or replace function app.check_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booked int;
  v_min_pay int;
  v_market_open boolean;
begin
  if tg_op = 'UPDATE' then
    if old.status not in ('open', 'filled') and not app.is_admin() then
      raise exception 'This job is % and can no longer be edited.', old.status using errcode = 'P0001';
    end if;
    if old.starts_at <= now() and (new.starts_at is distinct from old.starts_at
                                   or new.ends_at is distinct from old.ends_at
                                   or new.service_area_id is distinct from old.service_area_id
                                   or new.pay_rate_cents is distinct from old.pay_rate_cents
                                   or new.engagement_type_id is distinct from old.engagement_type_id) then
      raise exception 'The job has started; its time, place, pay and engagement type can no longer change.'
        using errcode = 'P0001';
    end if;
    select count(*) into v_booked from public.job_assignments
     where job_id = new.id and status in ('offered', 'accepted');
    if v_booked > 0 and (new.starts_at is distinct from old.starts_at
                         or new.ends_at is distinct from old.ends_at
                         or new.service_area_id is distinct from old.service_area_id
                         or new.pay_rate_cents < old.pay_rate_cents
                         or new.engagement_type_id is distinct from old.engagement_type_id) then
      raise exception 'Workers have been offered or accepted this job. Cancel their assignments before changing the time, town, engagement type or lowering the pay.'
        using errcode = 'P0001';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'A job cannot move to another business.' using errcode = 'P0001';
    end if;
  end if;

  -- Only checked when the value is set or changes, so later edits to other
  -- fields still work after the start time has passed.
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at then
    if new.starts_at <= now() then
      raise exception 'The start time must be in the future.' using errcode = 'P0001';
    end if;
    if new.starts_at > now() + interval '120 days' then
      raise exception 'Jobs can be posted up to 120 days ahead.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' or new.service_area_id is distinct from old.service_area_id then
    if not exists (
      select 1 from public.service_areas a join public.organizations o on o.market_id = a.market_id
      where a.id = new.service_area_id and o.id = new.organization_id
    ) then
      raise exception 'The job''s town must be in your business''s market.' using errcode = 'P0001';
    end if;
  end if;

  select m.is_active, m.min_hourly_pay_cents into v_market_open, v_min_pay
  from public.service_areas a join public.markets m on m.id = a.market_id
  where a.id = new.service_area_id;
  if (tg_op = 'INSERT' or new.service_area_id is distinct from old.service_area_id)
     and not coalesce(v_market_open, false) then
    raise exception 'QuickPro is not open in that market yet.' using errcode = 'P0001';
  end if;
  if (tg_op = 'INSERT' or new.pay_rate_cents is distinct from old.pay_rate_cents)
     and v_min_pay is not null and new.pay_rate_cents < v_min_pay then
    raise exception 'The hourly pay must be at least $% in this market.', to_char(v_min_pay / 100.0, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  if (tg_op = 'INSERT' or new.engagement_type_id is distinct from old.engagement_type_id)
     and not exists (select 1 from public.engagement_types where id = new.engagement_type_id and is_active) then
    raise exception 'Choose one of the engagement types QuickPro currently offers.' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and new.headcount is distinct from old.headcount then
    select count(*) into v_booked from public.job_assignments where job_id = new.id and status = 'accepted';
    if new.headcount < v_booked then
      raise exception '% workers have already accepted. Cancel an assignment before lowering the headcount.', v_booked
        using errcode = 'P0001';
    end if;
    -- Keep the fill status in step with the new headcount.
    if old.status in ('open', 'filled') then
      new.status := case when v_booked >= new.headcount then 'filled' else 'open' end::public.job_status;
    end if;
  end if;

  return new;
end;
$$;

-- Posting runs the contractor eligibility check (approved, current insurance).
create or replace function app.check_job_poster()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.assert_contractor_can_staff(new.organization_id);
  return new;
end;
$$;

create trigger jobs_check before insert or update on public.jobs
  for each row execute function app.check_job();
create trigger jobs_check_poster before insert on public.jobs
  for each row execute function app.check_job_poster();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger audit_jobs after insert or update or delete on public.jobs
  for each row execute function app.audit_row_change('job', 'id', 'organization_id');
create trigger audit_job_skills after insert or delete on public.job_skills
  for each row execute function app.audit_row_change('job_skill', 'job_id', '');
create trigger audit_job_sites after insert or update or delete on public.job_sites
  for each row execute function app.audit_row_change('job_site', 'job_id', '');
create trigger audit_job_applications after insert or update or delete on public.job_applications
  for each row execute function app.audit_row_change('job_application', 'id', 'organization_id');
create trigger audit_job_assignments after insert or update or delete on public.job_assignments
  for each row execute function app.audit_row_change('job_assignment', 'id', 'organization_id');

-- ---------------------------------------------------------------------------
-- Workflow functions
-- ---------------------------------------------------------------------------

-- Sets open/filled from the accepted assignments. Leaves completed and
-- cancelled jobs alone.
create or replace function app.refresh_job_fill(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.jobs j
     set status = case
       when (select count(*) from public.job_assignments a where a.job_id = j.id and a.status = 'accepted') >= j.headcount
         then 'filled'::public.job_status
       else 'open'::public.job_status
     end
   where j.id = p_job_id and j.status in ('open', 'filled');
end;
$$;

revoke all on function app.refresh_job_fill(uuid) from public;

create or replace function public.cancel_job(p_job_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or not (app.can_dispatch(v_job.organization_id) or app.is_admin()) then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;
  if v_job.status not in ('open', 'filled') then
    raise exception 'This job is already %.', v_job.status using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Add a short reason so the workers involved know why.' using errcode = 'P0001';
  end if;

  update public.job_assignments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = 'Job cancelled: ' || btrim(p_reason)
   where job_id = p_job_id and status in ('offered', 'accepted');

  update public.jobs
     set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason)
   where id = p_job_id;
end;
$$;

revoke all on function public.cancel_job(uuid, text) from public;
grant execute on function public.cancel_job(uuid, text) to authenticated;

-- Marks a job done once it has started. Accepted assignments are completed;
-- offers nobody answered lapse.
create or replace function public.complete_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or not (app.can_dispatch(v_job.organization_id) or app.is_admin()) then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;
  if v_job.status not in ('open', 'filled') then
    raise exception 'This job is already %.', v_job.status using errcode = 'P0001';
  end if;
  if v_job.starts_at > now() then
    raise exception 'A job can be marked complete once it has started.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.job_assignments where job_id = p_job_id and status = 'accepted') then
    raise exception 'Nobody accepted this job. Cancel it instead.' using errcode = 'P0001';
  end if;

  update public.job_assignments
     set status = 'completed', completed_at = now()
   where job_id = p_job_id and status = 'accepted';
  update public.job_assignments
     set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Offer not answered before the job finished'
   where job_id = p_job_id and status = 'offered';

  update public.jobs set status = 'completed', completed_at = now() where id = p_job_id;
end;
$$;

revoke all on function public.complete_job(uuid) from public;
grant execute on function public.complete_job(uuid) to authenticated;

create or replace function public.apply_to_job(p_job_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_id uuid;
  v_existing public.job_applications;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not app.is_approved_worker(v_user) then
    raise exception 'Your worker profile must be approved by QuickPro staff before you can apply.' using errcode = 'P0001';
  end if;
  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;
  if v_job.status <> 'open' or v_job.starts_at <= now() then
    raise exception 'This job is no longer taking applications.' using errcode = 'P0001';
  end if;

  select * into v_existing from public.job_applications where job_id = p_job_id and worker_user_id = v_user for update;
  if found then
    if v_existing.status <> 'withdrawn' then
      raise exception 'You have already applied for this job.' using errcode = 'P0001';
    end if;
    update public.job_applications
       set status = 'applied', note = left(coalesce(btrim(p_note), ''), 1000), created_at = now(), decided_at = null
     where id = v_existing.id;
    return v_existing.id;
  end if;

  insert into public.job_applications (job_id, organization_id, worker_user_id, note)
  values (p_job_id, v_job.organization_id, v_user, left(coalesce(btrim(p_note), ''), 1000))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.apply_to_job(uuid, text) from public;
grant execute on function public.apply_to_job(uuid, text) to authenticated;

create or replace function public.withdraw_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.job_applications;
begin
  select * into v_app from public.job_applications
   where id = p_application_id and worker_user_id = auth.uid() for update;
  if not found then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  if v_app.status <> 'applied' then
    raise exception 'Only a pending application can be withdrawn. If you were offered the job, decline the offer instead.'
      using errcode = 'P0001';
  end if;
  update public.job_applications set status = 'withdrawn', decided_at = now() where id = p_application_id;
end;
$$;

revoke all on function public.withdraw_application(uuid) from public;
grant execute on function public.withdraw_application(uuid) to authenticated;

create or replace function public.decline_application(p_application_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.job_applications;
begin
  select * into v_app from public.job_applications where id = p_application_id for update;
  if not found or not (app.can_dispatch(v_app.organization_id) or app.is_admin()) then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  if v_app.status <> 'applied' then
    raise exception 'This application has already been answered.' using errcode = 'P0001';
  end if;
  update public.job_applications
     set status = 'declined', decided_at = now(), decision_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '')
   where id = p_application_id;
end;
$$;

revoke all on function public.decline_application(uuid, text) from public;
grant execute on function public.decline_application(uuid, text) to authenticated;

-- Offers the job to a worker. Contractors offer to applicants; QuickPro staff
-- can also offer to any approved worker (concierge matching, D-010).
create or replace function public.offer_job(p_job_id uuid, p_worker_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
  v_app public.job_applications;
  v_is_admin boolean := app.is_admin();
  v_open_slots int;
  v_id uuid;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or not (app.can_dispatch(v_job.organization_id) or v_is_admin) then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;
  if v_job.status <> 'open' or v_job.starts_at <= now() then
    raise exception 'Offers can only be made on open jobs that have not started.' using errcode = 'P0001';
  end if;
  perform app.assert_contractor_can_staff(v_job.organization_id);
  if not app.is_approved_worker(p_worker_user_id) then
    raise exception 'That worker''s profile is not currently approved.' using errcode = 'P0001';
  end if;

  select * into v_app from public.job_applications
   where job_id = p_job_id and worker_user_id = p_worker_user_id for update;
  if found and v_app.status <> 'applied' then
    raise exception 'This application has already been answered.' using errcode = 'P0001';
  end if;
  if not found and not v_is_admin then
    raise exception 'You can only offer the job to workers who applied.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.job_assignments where job_id = p_job_id and worker_user_id = p_worker_user_id) then
    raise exception 'This worker has already been offered this job.' using errcode = 'P0001';
  end if;

  select v_job.headcount - count(*) into v_open_slots
  from public.job_assignments where job_id = p_job_id and status in ('offered', 'accepted');
  if v_open_slots <= 0 then
    raise exception 'Every spot on this job is already offered or filled.' using errcode = 'P0001';
  end if;

  insert into public.job_assignments (job_id, organization_id, worker_user_id, application_id, offered_by)
  values (p_job_id, v_job.organization_id, p_worker_user_id, v_app.id, auth.uid())
  returning id into v_id;

  if v_app.id is not null then
    update public.job_applications set status = 'offered', decided_at = now() where id = v_app.id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.offer_job(uuid, uuid) from public;
grant execute on function public.offer_job(uuid, uuid) to authenticated;

create or replace function public.respond_to_offer(p_assignment_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_asg public.job_assignments;
  v_job public.jobs;
  v_accepted int;
begin
  select * into v_asg from public.job_assignments
   where id = p_assignment_id and worker_user_id = v_user for update;
  if not found then
    raise exception 'Offer not found.' using errcode = 'P0002';
  end if;
  if v_asg.status <> 'offered' then
    raise exception 'This offer has already been answered.' using errcode = 'P0001';
  end if;
  select * into v_job from public.jobs where id = v_asg.job_id for update;

  if not p_accept then
    update public.job_assignments set status = 'declined', responded_at = now() where id = p_assignment_id;
    return;
  end if;

  if v_job.status <> 'open' or v_job.starts_at <= now() then
    raise exception 'This job is no longer open, so the offer can''t be accepted.' using errcode = 'P0001';
  end if;
  if not app.is_approved_worker(v_user) then
    raise exception 'Your worker profile must be approved to accept work.' using errcode = 'P0001';
  end if;
  if (select status from public.organizations where id = v_job.organization_id) <> 'approved' then
    raise exception 'This business is not currently approved on QuickPro, so the offer can''t be accepted.'
      using errcode = 'P0001';
  end if;
  select count(*) into v_accepted from public.job_assignments where job_id = v_job.id and status = 'accepted';
  if v_accepted >= v_job.headcount then
    raise exception 'This job has already been filled.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.job_assignments a join public.jobs j on j.id = a.job_id
    where a.worker_user_id = v_user and a.status = 'accepted' and a.id <> p_assignment_id
      and j.status in ('open', 'filled')
      and tstzrange(j.starts_at, j.ends_at) && tstzrange(v_job.starts_at, v_job.ends_at)
  ) then
    raise exception 'You already accepted another job at that time.' using errcode = 'P0001';
  end if;

  update public.job_assignments set status = 'accepted', responded_at = now() where id = p_assignment_id;
  perform app.refresh_job_fill(v_job.id);
end;
$$;

revoke all on function public.respond_to_offer(uuid, boolean) from public;
grant execute on function public.respond_to_offer(uuid, boolean) to authenticated;

-- Either side can cancel an offer or an accepted assignment before the job
-- ends. A cancelled spot reopens the job.
create or replace function public.cancel_assignment(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asg public.job_assignments;
  v_job public.jobs;
begin
  select * into v_asg from public.job_assignments where id = p_assignment_id for update;
  if not found or not (v_asg.worker_user_id = auth.uid() or app.can_dispatch(v_asg.organization_id) or app.is_admin()) then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if v_asg.status not in ('offered', 'accepted') then
    raise exception 'This assignment is already %.', v_asg.status using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Add a short reason for cancelling.' using errcode = 'P0001';
  end if;
  select * into v_job from public.jobs where id = v_asg.job_id for update;
  if v_job.ends_at <= now() then
    raise exception 'This job has already finished.' using errcode = 'P0001';
  end if;

  update public.job_assignments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = left(btrim(p_reason), 1000)
   where id = p_assignment_id;
  perform app.refresh_job_fill(v_job.id);
end;
$$;

revoke all on function public.cancel_assignment(uuid, text) from public;
grant execute on function public.cancel_assignment(uuid, text) to authenticated;

-- Day-of tracking. Check-in opens an hour before the start; check-out needs
-- a check-in. Times are recorded by the database clock.
create or replace function public.check_in(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asg public.job_assignments;
  v_job public.jobs;
begin
  select * into v_asg from public.job_assignments
   where id = p_assignment_id and worker_user_id = auth.uid() for update;
  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if v_asg.status <> 'accepted' then
    raise exception 'Only accepted jobs can be checked in to.' using errcode = 'P0001';
  end if;
  if v_asg.checked_in_at is not null then
    raise exception 'You already checked in.' using errcode = 'P0001';
  end if;
  select * into v_job from public.jobs where id = v_asg.job_id;
  if now() < v_job.starts_at - interval '1 hour' then
    raise exception 'Check-in opens an hour before the start time.' using errcode = 'P0001';
  end if;
  if now() > v_job.ends_at then
    raise exception 'This job has already ended.' using errcode = 'P0001';
  end if;
  update public.job_assignments set checked_in_at = now() where id = p_assignment_id;
end;
$$;

revoke all on function public.check_in(uuid) from public;
grant execute on function public.check_in(uuid) to authenticated;

create or replace function public.check_out(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asg public.job_assignments;
begin
  select * into v_asg from public.job_assignments
   where id = p_assignment_id and worker_user_id = auth.uid() for update;
  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if v_asg.status not in ('accepted', 'completed') or v_asg.checked_in_at is null then
    raise exception 'Check in before checking out.' using errcode = 'P0001';
  end if;
  if v_asg.checked_out_at is not null then
    raise exception 'You already checked out.' using errcode = 'P0001';
  end if;
  update public.job_assignments set checked_out_at = now() where id = p_assignment_id;
end;
$$;

revoke all on function public.check_out(uuid) from public;
grant execute on function public.check_out(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Read functions that cross the profile boundary on purpose, returning only
-- the fields the other side needs.
-- ---------------------------------------------------------------------------

-- The contractor's name for workers browsing jobs. Only approved contractors.
create or replace function public.contractor_display_name(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select name from public.organizations where id = p_org_id and kind = 'contractor' and status = 'approved';
$$;

revoke all on function public.contractor_display_name(uuid) from public;
grant execute on function public.contractor_display_name(uuid) to authenticated;

-- Applicants and crew for a job, for the contractor's members and staff.
-- Phone numbers are shared only once the worker has accepted.
create or replace function public.job_people(p_job_id uuid)
returns table (
  worker_user_id uuid,
  full_name text,
  headline text,
  years_experience int,
  home_area_name text,
  has_vehicle boolean,
  has_drivers_license boolean,
  skill_names text[],
  matching_skills int,
  application_id uuid,
  application_status public.application_status,
  application_note text,
  applied_at timestamptz,
  assignment_id uuid,
  assignment_status public.assignment_status,
  offered_at timestamptz,
  responded_at timestamptz,
  cancel_reason text,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  phone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.jobs where id = p_job_id;
  if v_org is null or not (app.is_org_member(v_org) or app.is_admin()) then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;

  return query
  with people as (
    select ap.worker_user_id from public.job_applications ap where ap.job_id = p_job_id
    union
    select asg.worker_user_id from public.job_assignments asg where asg.job_id = p_job_id
  )
  select
    w.user_id,
    pr.full_name,
    w.headline,
    w.years_experience,
    ha.name,
    w.has_vehicle,
    w.has_drivers_license,
    coalesce((select array_agg(s.name order by s.sort_order) from public.worker_skills ws
              join public.skills s on s.id = ws.skill_id where ws.user_id = w.user_id), '{}'),
    (select count(*)::int from public.worker_skills ws join public.job_skills js on js.skill_id = ws.skill_id
      where ws.user_id = w.user_id and js.job_id = p_job_id),
    ap.id,
    ap.status,
    ap.note,
    ap.created_at,
    asg.id,
    asg.status,
    asg.offered_at,
    asg.responded_at,
    asg.cancel_reason,
    asg.checked_in_at,
    asg.checked_out_at,
    case when asg.status in ('accepted', 'completed') then pr.phone end
  from people p
  join public.worker_profiles w on w.user_id = p.worker_user_id
  join public.profiles pr on pr.id = w.user_id
  left join public.service_areas ha on ha.id = w.home_service_area_id
  left join public.job_applications ap on ap.job_id = p_job_id and ap.worker_user_id = w.user_id
  left join public.job_assignments asg on asg.job_id = p_job_id and asg.worker_user_id = w.user_id
  order by coalesce(asg.offered_at, ap.created_at);
end;
$$;

revoke all on function public.job_people(uuid) from public;
grant execute on function public.job_people(uuid) to authenticated;
