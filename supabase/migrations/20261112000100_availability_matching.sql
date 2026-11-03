-- Availability matching. Compares a job's day and hours (in New York time)
-- with a worker's weekly availability, and checks whether the worker is
-- already booked on another job at that time. The answers are yes/no only;
-- the windows themselves stay private to the worker and staff.
--
-- Who may ask about a worker and a job: the worker, QuickPro staff, and the
-- job's business once the worker has applied to it or been offered it. For
-- anyone else the functions return null.
--
-- Nothing here deletes or drops anything; it only adds functions.

create or replace function app.may_see_worker_fit(p_worker uuid, p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_worker = (select auth.uid())
      or app.is_admin()
      or exists (
        select 1 from public.jobs j
        where j.id = p_job_id and app.is_org_member(j.organization_id)
          and (exists (select 1 from public.job_applications a where a.job_id = j.id and a.worker_user_id = p_worker)
               or exists (select 1 from public.job_assignments a where a.job_id = j.id and a.worker_user_id = p_worker))
      );
$$;

-- True when the worker's availability on the job's weekday covers the whole
-- shift (windows that touch, such as 07:00-12:00 and 12:00-17:00, count as
-- one). A shift that runs past midnight never fits, because availability is
-- set per day. False when the worker has set no availability that day.
create or replace function app.job_fits_availability(p_worker uuid, p_job_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamp;
  v_end timestamp;
  v_cover int4multirange;
begin
  if not app.may_see_worker_fit(p_worker, p_job_id) then
    return null;
  end if;
  select j.starts_at at time zone 'America/New_York', j.ends_at at time zone 'America/New_York'
    into v_start, v_end
  from public.jobs j where j.id = p_job_id;
  if v_start is null then
    return null;
  end if;
  if v_end::date <> v_start::date and v_end::time <> time '00:00' then
    return false;
  end if;
  select range_agg(int4range(
           (extract(epoch from w.start_time) / 60)::int,
           (extract(epoch from w.end_time) / 60)::int))
    into v_cover
  from public.worker_availability w
  where w.user_id = p_worker and w.weekday = extract(dow from v_start)::int;
  if v_cover is null then
    return false;
  end if;
  return v_cover @> int4range(
    (extract(epoch from v_start::time) / 60)::int,
    case when v_end::date <> v_start::date then 1440 else (extract(epoch from v_end::time) / 60)::int end);
end;
$$;

-- True when the worker has accepted another live job that overlaps this one
-- (the same rule respond_to_offer uses to refuse a double booking).
create or replace function app.booked_elsewhere(p_worker uuid, p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when not app.may_see_worker_fit(p_worker, p_job_id) then null else exists (
    select 1
    from public.jobs this
    join public.jobs other on other.id <> this.id
      and other.status in ('open', 'filled')
      and tstzrange(other.starts_at, other.ends_at) && tstzrange(this.starts_at, this.ends_at)
    join public.job_assignments a on a.job_id = other.id and a.worker_user_id = p_worker and a.status = 'accepted'
    where this.id = p_job_id
  ) end;
$$;

revoke all on function app.may_see_worker_fit(uuid, uuid) from public;
revoke all on function app.job_fits_availability(uuid, uuid) from public;
revoke all on function app.booked_elsewhere(uuid, uuid) from public;
grant execute on function app.may_see_worker_fit(uuid, uuid) to authenticated;
grant execute on function app.job_fits_availability(uuid, uuid) to authenticated;
grant execute on function app.booked_elsewhere(uuid, uuid) to authenticated;
