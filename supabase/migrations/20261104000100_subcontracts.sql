-- Subcontracting part of an awarded project to another contractor.
--
-- The contractor that won a project (the prime) can offer part of the work
-- to another approved contractor with current insurance (the
-- subcontractor): a scope and, optionally, an agreed amount. The
-- subcontractor accepts or declines. Once accepted it sees the project's
-- details and site, schedules and staffs its own jobs for the project, and
-- reports its part complete. The prime reports the whole project complete
-- only after every live subcontract is completed.
--
-- Who sees what:
-- - The customer sees which businesses are working on the project, their
--   jobs and attendance, never the subcontract amounts.
-- - The prime sees its subcontracts, amounts, and the subcontractors' jobs.
-- - A subcontractor sees the project details and site, its own subcontract
--   and jobs, and its own thread with the prime. Not the customer's award
--   price, other businesses' crews, or the customer–prime thread.
--
-- Additive: new type, table, columns, policies and functions. Functions
-- whose result shape changes are dropped and recreated in this file; no
-- data is changed or removed.

create type public.subcontract_status as enum ('offered', 'accepted', 'declined', 'cancelled', 'completed');

create table public.subcontracts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  prime_id uuid not null references public.organizations (id) on delete cascade,
  sub_id uuid not null references public.organizations (id) on delete cascade,
  scope text not null check (char_length(scope) between 10 and 2000),
  amount_cents int check (amount_cents is null or amount_cents between 100 and 100000000),
  status public.subcontract_status not null default 'offered',
  offered_by uuid references public.profiles (id) on delete set null,
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  response_note text check (response_note is null or char_length(response_note) <= 1000),
  completed_at timestamptz,
  completion_note text check (completion_note is null or char_length(completion_note) <= 1000),
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (prime_id <> sub_id)
);

create index subcontracts_request_idx on public.subcontracts (request_id);
create index subcontracts_sub_idx on public.subcontracts (sub_id, created_at desc);
-- One live subcontract per business per project.
create unique index subcontracts_live_idx on public.subcontracts (request_id, sub_id) where status in ('offered', 'accepted');

create trigger subcontracts_touch before update on public.subcontracts
  for each row execute function app.touch_updated_at();

alter table public.subcontracts enable row level security;

-- The two businesses and staff. The customer reads subcontractors through
-- project_subcontracts(), which leaves out amounts.
create policy "prime, subcontractor and staff read subcontracts"
  on public.subcontracts for select to authenticated
  using (app.is_admin() or app.is_org_member(prime_id) or app.is_org_member(sub_id));
grant select on public.subcontracts to authenticated;

create trigger audit_subcontracts after insert or update or delete on public.subcontracts
  for each row execute function app.audit_row_change('subcontract', 'id', 'sub_id');

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------

-- The current user belongs to a business with any subcontract on the project (an offer included).
create or replace function app.has_subcontract(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subcontracts s
    where s.request_id = p_request_id and app.is_org_member(s.sub_id)
  );
$$;

-- The current user belongs to a subcontractor working on the project (accepted or finished).
create or replace function app.is_project_sub(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subcontracts s
    where s.request_id = p_request_id and s.status in ('accepted', 'completed') and app.is_org_member(s.sub_id)
  );
$$;

-- The prime, the subcontractor and staff.
create or replace function app.in_subcontract(p_subcontract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin() or exists (
    select 1 from public.subcontracts s
    where s.id = p_subcontract_id and (app.is_org_member(s.prime_id) or app.is_org_member(s.sub_id))
  );
$$;

-- Requests are also visible to businesses offered a subcontract on them.
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
      )
      or app.has_subcontract(p_request_id);
$$;

-- Subcontractors that accepted see the site, like the prime.
create policy "subcontractors read project sites"
  on public.service_request_sites for select to authenticated
  using (app.is_project_sub(request_id));

-- ---------------------------------------------------------------------------
-- Jobs: subcontractors schedule their own jobs for the project
-- ---------------------------------------------------------------------------
create or replace function app.check_job_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
begin
  if tg_op = 'UPDATE' then
    if new.service_request_id is distinct from old.service_request_id then
      raise exception 'A job cannot move to another project.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.service_request_id is null then
    return new;
  end if;
  select * into v_req from public.service_requests where id = new.service_request_id;
  if not found or v_req.status <> 'awarded' or not (
    app.awarded_contractor(v_req.id) is not distinct from new.organization_id
    or exists (select 1 from public.subcontracts s
               where s.request_id = v_req.id and s.sub_id = new.organization_id and s.status = 'accepted')
  ) then
    raise exception 'Jobs can be scheduled only for projects awarded to your business or subcontracted to it.' using errcode = 'P0001';
  end if;
  if v_req.work_completed_at is not null then
    raise exception 'This project was reported complete. The customer can send it back if more work is needed.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- History: subcontract events, and what a subcontractor may read
-- ---------------------------------------------------------------------------
alter table public.service_request_events
  add column subcontract_id uuid references public.subcontracts (id) on delete set null;

-- A subcontractor reads the events about its own subcontract and its own jobs.
create policy "subcontractors read their part of the project history"
  on public.service_request_events for select to authenticated
  using (
    (subcontract_id is not null and exists (
      select 1 from public.subcontracts s where s.id = subcontract_id and app.is_org_member(s.sub_id)))
    or (job_id is not null and exists (
      select 1 from public.jobs j where j.id = job_id and app.is_org_member(j.organization_id)
        and j.organization_id <> coalesce(app.awarded_contractor(request_id), '00000000-0000-0000-0000-000000000000'::uuid)))
  );

create or replace function app.log_subcontract_event(
  p_subcontract public.subcontracts, p_kind text, p_summary text, p_detail text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.service_request_events (request_id, kind, summary, detail, actor_id, actor_label, subcontract_id)
  values (p_subcontract.request_id, p_kind, left(p_summary, 300), left(coalesce(p_detail, ''), 1000), auth.uid(),
          case when auth.uid() is null then ''
               when app.is_admin() then 'QuickPro staff'
               else left(coalesce(app.person_name(auth.uid()), ''), 120) end,
          p_subcontract.id);
$$;

-- ---------------------------------------------------------------------------
-- Project jobs and attendance, now with the business that runs each job
-- ---------------------------------------------------------------------------
drop function public.request_jobs(uuid);
drop function public.request_attendance(uuid);

-- Full view for the customer, the prime and staff; a subcontractor gets its own jobs.
create or replace function public.request_jobs(p_request_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  title text,
  status public.job_status,
  starts_at timestamptz,
  ends_at timestamptz,
  headcount int,
  booked int,
  checked_in int,
  checked_out int,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := app.can_see_request_site(p_request_id);
begin
  if not v_full and not app.is_project_sub(p_request_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  return query
  select j.id, j.organization_id, o.name, j.title, j.status, j.starts_at, j.ends_at, j.headcount,
         (select count(*)::int from public.job_assignments a where a.job_id = j.id and a.status in ('accepted', 'completed')),
         (select count(*)::int from public.job_assignments a where a.job_id = j.id and a.status in ('accepted', 'completed') and a.checked_in_at is not null),
         (select count(*)::int from public.job_assignments a where a.job_id = j.id and a.status in ('accepted', 'completed') and a.checked_out_at is not null),
         j.completed_at
  from public.jobs j
  join public.organizations o on o.id = j.organization_id
  where j.service_request_id = p_request_id and (v_full or app.is_org_member(j.organization_id))
  order by j.starts_at, j.id;
end;
$$;

create or replace function public.request_attendance(p_request_id uuid)
returns table (
  job_id uuid,
  worker_name text,
  status public.assignment_status,
  checked_in_at timestamptz,
  checked_out_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := app.can_see_request_site(p_request_id);
begin
  if not v_full and not app.is_project_sub(p_request_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  return query
  select a.job_id, app.person_name(a.worker_user_id), a.status, a.checked_in_at, a.checked_out_at
  from public.job_assignments a
  join public.jobs j on j.id = a.job_id
  where j.service_request_id = p_request_id and a.status in ('accepted', 'completed')
    and (v_full or app.is_org_member(j.organization_id))
  order by j.starts_at, a.job_id, a.checked_in_at nulls last, 2;
end;
$$;

-- ---------------------------------------------------------------------------
-- Subcontracts on a project
-- ---------------------------------------------------------------------------

-- Amounts and notes for the two businesses and staff; the customer sees who and what, not the price.
create or replace function public.project_subcontracts(p_request_id uuid)
returns table (
  id uuid,
  prime_id uuid,
  prime_name text,
  sub_id uuid,
  sub_name text,
  scope text,
  amount_cents int,
  status public.subcontract_status,
  offered_at timestamptz,
  responded_at timestamptz,
  response_note text,
  completed_at timestamptz,
  completion_note text,
  cancelled_at timestamptz,
  cancel_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := app.can_see_request_site(p_request_id);
  v_customer boolean;
begin
  if not v_full and not app.has_subcontract(p_request_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  select app.is_org_member(r.organization_id) and not app.is_admin() into v_customer
    from public.service_requests r where r.id = p_request_id;
  return query
  select s.id, s.prime_id, p.name, s.sub_id, o.name, s.scope,
         case when v_customer then null else s.amount_cents end,
         s.status, s.offered_at, s.responded_at, s.response_note, s.completed_at, s.completion_note,
         s.cancelled_at, s.cancel_reason
  from public.subcontracts s
  join public.organizations p on p.id = s.prime_id
  join public.organizations o on o.id = s.sub_id
  where s.request_id = p_request_id
    and (app.is_admin() or app.is_org_member(s.prime_id) or app.is_org_member(s.sub_id)
         -- The customer sees the businesses working on its project, not offers they turned down.
         or (v_customer and s.status in ('accepted', 'completed')))
  order by s.offered_at, s.id;
end;
$$;

-- Approved contractors with current insurance in the prime's market, for choosing a subcontractor.
create or replace function public.subcontractor_directory(p_prime_id uuid, p_category_id uuid)
returns table (
  id uuid,
  name text,
  years_in_business int,
  crew_size int,
  category_names text[],
  area_names text[],
  serves_category boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_market uuid;
begin
  if not app.can_dispatch(p_prime_id) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  select market_id into v_market from public.organizations where organizations.id = p_prime_id;
  return query
  select o.id, o.name, o.years_in_business, o.crew_size,
         coalesce((select array_agg(c.name order by c.sort_order) from public.contractor_services s
                   join public.service_categories c on c.id = s.category_id where s.organization_id = o.id), '{}'),
         coalesce((select array_agg(a.name order by a.name) from public.contractor_service_areas sa
                   join public.service_areas a on a.id = sa.service_area_id where sa.organization_id = o.id), '{}'),
         p_category_id is not null and exists (select 1 from public.contractor_services s where s.organization_id = o.id and s.category_id = p_category_id)
  from public.organizations o
  where o.kind = 'contractor' and o.status = 'approved' and o.market_id = v_market and o.id <> p_prime_id
    and app.org_has_reviewed_insurance(o.id)
  order by 7 desc, o.name;
end;
$$;

create or replace function public.offer_subcontract(p_request_id uuid, p_sub_id uuid, p_scope text, p_amount_cents int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
  v_prime uuid := app.awarded_contractor(p_request_id);
  v_sub public.organizations;
  v_scope text := btrim(coalesce(p_scope, ''));
  v_sc public.subcontracts;
begin
  select * into v_req from public.service_requests where id = p_request_id;
  if v_req.id is null or v_prime is null or not app.can_dispatch(v_prime) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'awarded' or v_req.work_completed_at is not null then
    raise exception 'Subcontracts can be offered only while the project is in progress.' using errcode = 'P0001';
  end if;
  select * into v_sub from public.organizations where id = p_sub_id;
  if v_sub.id is null or v_sub.kind <> 'contractor' or v_sub.status <> 'approved' or v_sub.id = v_prime then
    raise exception 'Choose another approved contractor.' using errcode = 'P0001';
  end if;
  if v_sub.market_id is distinct from (select market_id from public.organizations where id = v_prime) then
    raise exception 'The subcontractor must work in your market.' using errcode = 'P0001';
  end if;
  if not app.org_has_reviewed_insurance(v_sub.id) then
    raise exception '% doesn''t have a current, reviewed general liability certificate.', v_sub.name using errcode = 'P0001';
  end if;
  if char_length(v_scope) < 10 then
    raise exception 'Describe the part of the work you''re handing over in a sentence or two.' using errcode = 'P0001';
  end if;
  if char_length(v_scope) > 2000 then
    raise exception 'Keep the scope under 2,000 characters.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.subcontracts where request_id = p_request_id and sub_id = p_sub_id and status in ('offered', 'accepted')) then
    raise exception '% already has a subcontract on this project.', v_sub.name using errcode = 'P0001';
  end if;
  if (select count(*) from public.subcontracts where request_id = p_request_id) >= 20 then
    raise exception 'A project can have at most 20 subcontract offers.' using errcode = 'P0001';
  end if;

  insert into public.subcontracts (request_id, prime_id, sub_id, scope, amount_cents, offered_by)
  values (p_request_id, v_prime, p_sub_id, v_scope, p_amount_cents, auth.uid())
  returning * into v_sc;
  perform app.notify_dispatchers(p_sub_id, 'subcontract.offered',
    coalesce((select name from public.organizations where id = v_prime), 'A contractor') || ' offered you a subcontract',
    v_req.title || ': ' || left(v_scope, 200), '/app/org/' || p_sub_id || '/requests/' || p_request_id, null);
  return v_sc.id;
end;
$$;

create or replace function public.respond_to_subcontract(p_subcontract_id uuid, p_accept boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sc public.subcontracts;
  v_req public.service_requests;
  v_sub text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_sc from public.subcontracts where id = p_subcontract_id for update;
  if v_sc.id is null or not app.can_dispatch(v_sc.sub_id) then
    raise exception 'Subcontract not found.' using errcode = 'P0002';
  end if;
  if v_sc.status <> 'offered' then
    raise exception 'This subcontract is already %.', v_sc.status using errcode = 'P0001';
  end if;
  select * into v_req from public.service_requests where id = v_sc.request_id;
  if p_accept and (v_req.status <> 'awarded' or v_req.work_completed_at is not null) then
    raise exception 'This project is no longer in progress.' using errcode = 'P0001';
  end if;
  if p_accept then
    perform app.assert_contractor_can_staff(v_sc.sub_id);
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = 'P0001';
  end if;

  update public.subcontracts
     set status = case when p_accept then 'accepted' else 'declined' end::public.subcontract_status,
         responded_at = now(), response_note = v_note
   where id = p_subcontract_id
   returning * into v_sc;
  select name into v_sub from public.organizations where id = v_sc.sub_id;
  if p_accept then
    perform app.log_subcontract_event(v_sc, 'subcontract.accepted', v_sub || ' joined as a subcontractor', v_sc.scope);
  end if;
  perform app.notify_dispatchers(v_sc.prime_id, 'subcontract.' || v_sc.status,
    v_sub || case when p_accept then ' accepted' else ' declined' end || ' your subcontract',
    v_req.title || coalesce(': ' || v_note, ''), '/app/org/' || v_sc.prime_id || '/requests/' || v_sc.request_id, null);
end;
$$;

-- Either side can end a subcontract before it is completed. The
-- subcontractor's open jobs on the project must be completed or cancelled first.
create or replace function public.cancel_subcontract(p_subcontract_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sc public.subcontracts;
  v_req public.service_requests;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_open int;
  v_by_prime boolean;
  v_other uuid;
begin
  select * into v_sc from public.subcontracts where id = p_subcontract_id for update;
  if v_sc.id is null or not (app.can_dispatch(v_sc.prime_id) or app.can_dispatch(v_sc.sub_id) or app.is_admin()) then
    raise exception 'Subcontract not found.' using errcode = 'P0002';
  end if;
  if v_sc.status not in ('offered', 'accepted') then
    raise exception 'This subcontract is already %.', v_sc.status using errcode = 'P0001';
  end if;
  if v_reason = '' then
    raise exception 'Add a short reason so the other business knows why.' using errcode = 'P0001';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Keep the reason under 1,000 characters.' using errcode = 'P0001';
  end if;
  select count(*) into v_open from public.jobs
   where service_request_id = v_sc.request_id and organization_id = v_sc.sub_id and status in ('open', 'filled');
  if v_open > 0 then
    raise exception 'The subcontractor still has % open % on this project. They must complete or cancel them first.',
      v_open, case when v_open = 1 then 'job' else 'jobs' end using errcode = 'P0001';
  end if;

  update public.subcontracts set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
   where id = p_subcontract_id returning * into v_sc;
  select * into v_req from public.service_requests where id = v_sc.request_id;
  v_by_prime := app.can_dispatch(v_sc.prime_id);
  v_other := case when v_by_prime then v_sc.sub_id else v_sc.prime_id end;
  if v_sc.responded_at is not null then
    perform app.log_subcontract_event(v_sc, 'subcontract.cancelled',
      'Subcontract with ' || (select name from public.organizations where id = v_sc.sub_id) || ' ended', v_reason);
  end if;
  perform app.notify_dispatchers(v_other, 'subcontract.cancelled', 'Subcontract ended: ' || v_req.title, left(v_reason, 400),
    '/app/org/' || v_other || '/requests/' || v_sc.request_id, null);
end;
$$;

-- The subcontractor reports its part done once its jobs on the project are finished.
create or replace function public.complete_subcontract(p_subcontract_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sc public.subcontracts;
  v_req public.service_requests;
  v_note text := btrim(coalesce(p_note, ''));
  v_open int;
begin
  select * into v_sc from public.subcontracts where id = p_subcontract_id for update;
  if v_sc.id is null or not app.can_dispatch(v_sc.sub_id) then
    raise exception 'Subcontract not found.' using errcode = 'P0002';
  end if;
  if v_sc.status <> 'accepted' then
    raise exception 'Only an accepted subcontract can be reported complete.' using errcode = 'P0001';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = 'P0001';
  end if;
  select count(*) into v_open from public.jobs
   where service_request_id = v_sc.request_id and organization_id = v_sc.sub_id and status in ('open', 'filled');
  if v_open > 0 then
    raise exception 'Complete or cancel your % open % on this project first.', v_open,
      case when v_open = 1 then 'job' else 'jobs' end using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.jobs where service_request_id = v_sc.request_id and organization_id = v_sc.sub_id and status = 'completed') then
    raise exception 'Schedule and complete at least one job for your part first.' using errcode = 'P0001';
  end if;

  update public.subcontracts set status = 'completed', completed_at = now(), completion_note = nullif(v_note, '')
   where id = p_subcontract_id returning * into v_sc;
  select * into v_req from public.service_requests where id = v_sc.request_id;
  perform app.log_subcontract_event(v_sc, 'subcontract.completed',
    (select name from public.organizations where id = v_sc.sub_id) || ' finished its part', v_note);
  perform app.notify_dispatchers(v_sc.prime_id, 'subcontract.completed',
    (select name from public.organizations where id = v_sc.sub_id) || ' finished its part of ' || v_req.title,
    left(v_note, 400), '/app/org/' || v_sc.prime_id || '/requests/' || v_sc.request_id, null);
end;
$$;

-- The prime reports the project complete only once no subcontract is still live.
create or replace function public.report_request_work_complete(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
  v_contractor uuid;
  v_open int;
  v_live int;
  v_note text := btrim(coalesce(p_note, ''));
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  v_contractor := app.awarded_contractor(p_request_id);
  if v_req.id is null or v_contractor is null or not app.can_dispatch(v_contractor) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'awarded' then
    raise exception 'This project is %.', v_req.status using errcode = 'P0001';
  end if;
  if v_req.work_completed_at is not null then
    raise exception 'You already reported this project complete.' using errcode = 'P0001';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = 'P0001';
  end if;
  select count(*) into v_open from public.jobs where service_request_id = p_request_id and status in ('open', 'filled');
  if v_open > 0 then
    raise exception 'Complete or cancel the % % still open on this project first.', v_open,
      case when v_open = 1 then 'job' else 'jobs' end using errcode = 'P0001';
  end if;
  select count(*) into v_live from public.subcontracts where request_id = p_request_id and status in ('offered', 'accepted');
  if v_live > 0 then
    raise exception 'Wait for % % to finish, or end them, first.', v_live,
      case when v_live = 1 then 'subcontract' else 'subcontracts' end using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.jobs where service_request_id = p_request_id and status = 'completed') then
    raise exception 'Schedule and complete at least one job for this project first.' using errcode = 'P0001';
  end if;

  update public.service_requests
     set work_completed_at = now(), work_completed_by = auth.uid(), completion_note = nullif(v_note, '')
   where id = p_request_id;
  perform app.log_request_event(p_request_id, 'work.reported', 'Contractor reported the work complete', v_note, null);
  perform app.notify_dispatchers(v_req.organization_id, 'request.work_complete', 'Confirm completion: ' || v_req.title,
    coalesce((select name from public.organizations where id = v_contractor), 'The contractor')
      || ' reported the work complete.' || case when v_note <> '' then ' ' || left(v_note, 300) else '' end,
    '/app/org/' || v_req.organization_id || '/requests/' || v_req.id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Messages: a separate thread between the prime and each subcontractor
-- ---------------------------------------------------------------------------
alter table public.request_messages
  add column subcontract_id uuid references public.subcontracts (id) on delete cascade;

drop policy "customer, awarded contractor and staff see request messages" on public.request_messages;
create policy "each thread's businesses and staff see request messages"
  on public.request_messages for select to authenticated
  using (
    (subcontract_id is null and app.can_see_request_site(request_id))
    or (subcontract_id is not null and app.in_subcontract(subcontract_id))
  );
grant select (subcontract_id) on public.request_messages to authenticated;

-- The customer–prime thread leaves out subcontract messages.
create or replace function public.request_thread(p_request_id uuid)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_side text,
  organization_name text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
begin
  select organization_id into v_customer from public.service_requests where service_requests.id = p_request_id;
  if v_customer is null or not app.can_see_request_site(p_request_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  return query
  select m.id, m.author_id, coalesce(nullif(p.full_name, ''), 'Former member'),
         case when m.author_org_id = v_customer then 'customer'
              when m.author_org_id is not null then 'contractor'
              else 'staff' end,
         o.name, m.body, m.created_at
  from public.request_messages m
  left join public.profiles p on p.id = m.author_id
  left join public.organizations o on o.id = m.author_org_id
  where m.request_id = p_request_id and m.subcontract_id is null
  order by m.created_at, m.id;
end;
$$;

create or replace function public.post_request_message(p_request_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
  v_contractor uuid;
  v_author_org uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_preview text;
  v_org uuid;
  v_user uuid;
  v_link text;
begin
  select * into v_req from public.service_requests where id = p_request_id;
  v_contractor := app.awarded_contractor(p_request_id);
  if v_req.id is null or v_contractor is null then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if app.is_org_member(v_req.organization_id) then
    v_author_org := v_req.organization_id;
  elsif app.is_org_member(v_contractor) then
    v_author_org := v_contractor;
  elsif not app.is_admin() then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_body = '' then
    raise exception 'Write a message first.' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep messages under 2,000 characters.' using errcode = 'P0001';
  end if;
  if v_req.status = 'completed' and v_req.completed_at < now() - interval '30 days' then
    raise exception 'Messages on this project are closed.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.request_messages
      where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'You''re sending messages too quickly. Wait a minute and try again.' using errcode = 'P0001';
  end if;

  insert into public.request_messages (request_id, author_id, author_org_id, body)
  values (p_request_id, auth.uid(), v_author_org, v_body)
  returning id into v_id;

  v_preview := app.person_name(auth.uid()) || ': ' || left(v_body, 160);
  foreach v_org in array array[v_req.organization_id, v_contractor] loop
    v_link := '/app/org/' || v_org || '/requests/' || v_req.id;
    for v_user in
      select user_id from public.organization_members where organization_id = v_org and role in ('owner', 'admin', 'dispatcher')
    loop
      continue when v_user = auth.uid();
      update public.notifications
         set body = left(v_preview, 500), created_at = now()
       where user_id = v_user and link_path = v_link and kind = 'request.message' and read_at is null;
      if not found then
        perform app.notify(v_user, 'request.message', 'New message on ' || v_req.title, v_preview, v_link, v_org, null);
      end if;
    end loop;
  end loop;
  return v_id;
end;
$$;

create or replace function public.subcontract_thread(p_subcontract_id uuid)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_side text,
  organization_name text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sc public.subcontracts;
begin
  select * into v_sc from public.subcontracts where subcontracts.id = p_subcontract_id;
  if v_sc.id is null or not app.in_subcontract(p_subcontract_id) then
    raise exception 'Subcontract not found.' using errcode = 'P0002';
  end if;
  return query
  select m.id, m.author_id, coalesce(nullif(p.full_name, ''), 'Former member'),
         case when m.author_org_id = v_sc.prime_id then 'contractor'
              when m.author_org_id = v_sc.sub_id then 'subcontractor'
              else 'staff' end,
         o.name, m.body, m.created_at
  from public.request_messages m
  left join public.profiles p on p.id = m.author_id
  left join public.organizations o on o.id = m.author_org_id
  where m.subcontract_id = p_subcontract_id
  order by m.created_at, m.id;
end;
$$;

create or replace function public.post_subcontract_message(p_subcontract_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sc public.subcontracts;
  v_title text;
  v_author_org uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_preview text;
  v_org uuid;
  v_user uuid;
  v_link text;
begin
  select * into v_sc from public.subcontracts where id = p_subcontract_id;
  if v_sc.id is null then
    raise exception 'Subcontract not found.' using errcode = 'P0002';
  end if;
  if app.is_org_member(v_sc.prime_id) then
    v_author_org := v_sc.prime_id;
  elsif app.is_org_member(v_sc.sub_id) then
    v_author_org := v_sc.sub_id;
  elsif not app.is_admin() then
    raise exception 'Subcontract not found.' using errcode = 'P0002';
  end if;
  if v_body = '' then
    raise exception 'Write a message first.' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep messages under 2,000 characters.' using errcode = 'P0001';
  end if;
  if v_sc.status in ('declined', 'cancelled') then
    raise exception 'This subcontract has ended.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.request_messages
      where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'You''re sending messages too quickly. Wait a minute and try again.' using errcode = 'P0001';
  end if;

  insert into public.request_messages (request_id, author_id, author_org_id, body, subcontract_id)
  values (v_sc.request_id, auth.uid(), v_author_org, v_body, p_subcontract_id)
  returning id into v_id;

  select title into v_title from public.service_requests where id = v_sc.request_id;
  v_preview := app.person_name(auth.uid()) || ': ' || left(v_body, 160);
  foreach v_org in array array[v_sc.prime_id, v_sc.sub_id] loop
    v_link := '/app/org/' || v_org || '/requests/' || v_sc.request_id;
    for v_user in
      select user_id from public.organization_members where organization_id = v_org and role in ('owner', 'admin', 'dispatcher')
    loop
      continue when v_user = auth.uid();
      update public.notifications
         set body = left(v_preview, 500), created_at = now()
       where user_id = v_user and link_path = v_link and kind = 'subcontract.message' and read_at is null;
      if not found then
        perform app.notify(v_user, 'subcontract.message', 'Subcontract message: ' || v_title, v_preview, v_link, v_org, null);
      end if;
    end loop;
  end loop;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function app.has_subcontract(uuid) from public;
revoke all on function app.is_project_sub(uuid) from public;
revoke all on function app.in_subcontract(uuid) from public;
revoke all on function app.log_subcontract_event(public.subcontracts, text, text, text) from public;
grant execute on function app.has_subcontract(uuid) to authenticated;
grant execute on function app.is_project_sub(uuid) to authenticated;
grant execute on function app.in_subcontract(uuid) to authenticated;

revoke all on function public.request_jobs(uuid) from public;
revoke all on function public.request_attendance(uuid) from public;
revoke all on function public.project_subcontracts(uuid) from public;
revoke all on function public.subcontractor_directory(uuid, uuid) from public;
revoke all on function public.offer_subcontract(uuid, uuid, text, int) from public;
revoke all on function public.respond_to_subcontract(uuid, boolean, text) from public;
revoke all on function public.cancel_subcontract(uuid, text) from public;
revoke all on function public.complete_subcontract(uuid, text) from public;
revoke all on function public.subcontract_thread(uuid) from public;
revoke all on function public.post_subcontract_message(uuid, text) from public;
grant execute on function public.request_jobs(uuid) to authenticated;
grant execute on function public.request_attendance(uuid) to authenticated;
grant execute on function public.project_subcontracts(uuid) to authenticated;
grant execute on function public.subcontractor_directory(uuid, uuid) to authenticated;
grant execute on function public.offer_subcontract(uuid, uuid, text, int) to authenticated;
grant execute on function public.respond_to_subcontract(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_subcontract(uuid, text) to authenticated;
grant execute on function public.complete_subcontract(uuid, text) to authenticated;
grant execute on function public.subcontract_thread(uuid) to authenticated;
grant execute on function public.post_subcontract_message(uuid, text) to authenticated;

-- Job history names the business when a subcontractor runs the job.
create or replace function app.log_project_job_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by text := '';
begin
  if new.service_request_id is null then
    return null;
  end if;
  if new.organization_id is distinct from app.awarded_contractor(new.service_request_id) then
    v_by := ' (' || coalesce((select name from public.organizations where id = new.organization_id), 'subcontractor') || ')';
  end if;
  if tg_op = 'INSERT' then
    perform app.log_request_event(new.service_request_id, 'job.scheduled', left('Job scheduled: ' || new.title || v_by, 300),
      app.job_when(new.starts_at) || ' · ' || new.headcount || case when new.headcount = 1 then ' person' else ' people' end,
      new.id);
  elsif new.status is distinct from old.status and new.status in ('completed', 'cancelled') then
    perform app.log_request_event(new.service_request_id, 'job.' || new.status,
      left(case new.status when 'completed' then 'Job completed: ' else 'Job cancelled: ' end || new.title || v_by, 300),
      case when new.status = 'cancelled' then coalesce(new.cancel_reason, '') else '' end,
      new.id);
  end if;
  return null;
end;
$$;
