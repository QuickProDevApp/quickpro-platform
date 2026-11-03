-- Timesheets: the hours a worker worked on a shift, approved by the
-- business that engaged them, for its own payroll. QuickPro does not run
-- payroll or move money; the pay shown is an estimate at the job's rate.
--
-- After a shift ends (or the worker checks out), the business's owners,
-- admins and dispatchers approve the hours: as recorded at check-in and
-- check-out, or adjusted with a note. The worker sees the approved hours and
-- can question them; the business then approves again.
--
-- Nothing here deletes or drops anything.

create type public.timesheet_status as enum ('approved', 'queried');

create table public.timesheets (
  assignment_id uuid primary key references public.job_assignments (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  worker_user_id uuid not null references public.worker_profiles (user_id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  break_minutes int not null default 0 check (break_minutes between 0 and 600),
  worked_minutes int not null check (worked_minutes >= 0),
  pay_rate_cents int not null check (pay_rate_cents >= 0),
  status public.timesheet_status not null,
  adjust_note text check (adjust_note is null or char_length(adjust_note) <= 500),
  approved_at timestamptz not null,
  approved_by uuid references public.profiles (id) on delete set null,
  query_note text check (query_note is null or char_length(query_note) <= 1000),
  queried_at timestamptz,
  check (ended_at > started_at),
  check (ended_at - started_at <= interval '24 hours')
);

create index timesheets_org_idx on public.timesheets (organization_id, started_at);
create index timesheets_worker_idx on public.timesheets (worker_user_id, started_at);

alter table public.timesheets enable row level security;

-- The business, the worker and staff. Every change goes through functions.
create policy "business, worker and staff read timesheets"
  on public.timesheets for select to authenticated
  using (app.is_org_member(organization_id) or worker_user_id = (select auth.uid()) or app.is_admin());
grant select on public.timesheets to authenticated;

create trigger audit_timesheets after insert or update or delete on public.timesheets
  for each row execute function app.audit_row_change('timesheet', 'assignment_id', 'organization_id');

-- Approve (or re-approve) a shift's hours. Times differing from the
-- worker's own check-in or check-out by more than five minutes need a note,
-- which the worker sees.
create or replace function public.approve_timesheet(
  p_assignment_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_break_minutes int, p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asg public.job_assignments;
  v_job public.jobs;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_break int := coalesce(p_break_minutes, 0);
  v_minutes int;
  v_adjusted boolean;
begin
  select * into v_asg from public.job_assignments where id = p_assignment_id for update;
  if v_asg.id is null or not (app.is_org_member(v_asg.organization_id) or app.is_admin()) then
    raise exception 'Shift not found.' using errcode = 'P0002';
  end if;
  if not app.can_dispatch(v_asg.organization_id) then
    raise exception 'Only owners, admins and dispatchers can approve hours.' using errcode = 'P0001';
  end if;
  select * into v_job from public.jobs where id = v_asg.job_id;
  if v_asg.status not in ('accepted', 'completed') or v_job.status = 'cancelled' then
    raise exception 'Only booked shifts have hours to approve.' using errcode = 'P0001';
  end if;
  if v_job.ends_at > now() and v_asg.checked_out_at is null then
    raise exception 'You can approve hours once the shift ends or the worker checks out.' using errcode = 'P0001';
  end if;
  if p_started_at is null or p_ended_at is null or p_ended_at <= p_started_at then
    raise exception 'The end time must be after the start time.' using errcode = 'P0001';
  end if;
  if p_ended_at - p_started_at > interval '24 hours' then
    raise exception 'A shift can be at most 24 hours.' using errcode = 'P0001';
  end if;
  if p_ended_at > now() + interval '5 minutes' then
    raise exception 'The end time can''t be in the future.' using errcode = 'P0001';
  end if;
  if p_started_at < v_job.starts_at - interval '12 hours' or p_ended_at > v_job.ends_at + interval '12 hours' then
    raise exception 'The times must be within 12 hours of the scheduled shift.' using errcode = 'P0001';
  end if;
  v_minutes := (extract(epoch from (p_ended_at - p_started_at)) / 60)::int - v_break;
  if v_break < 0 or v_minutes <= 0 then
    raise exception 'The break must be shorter than the shift.' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the note to 500 characters.' using errcode = 'P0001';
  end if;
  v_adjusted := v_asg.checked_in_at is null or v_asg.checked_out_at is null
    or abs(extract(epoch from (p_started_at - v_asg.checked_in_at))) > 300
    or abs(extract(epoch from (p_ended_at - v_asg.checked_out_at))) > 300;
  if v_adjusted and v_note is null then
    raise exception 'Add a note for the worker explaining the change from their check-in and check-out.'
      using errcode = 'P0001';
  end if;

  insert into public.timesheets (assignment_id, job_id, organization_id, worker_user_id, started_at, ended_at,
                                 break_minutes, worked_minutes, pay_rate_cents, status, adjust_note, approved_at, approved_by)
  values (v_asg.id, v_asg.job_id, v_asg.organization_id, v_asg.worker_user_id, p_started_at, p_ended_at,
          v_break, v_minutes, v_job.pay_rate_cents, 'approved', v_note, now(), auth.uid())
  on conflict (assignment_id) do update
     set started_at = excluded.started_at, ended_at = excluded.ended_at, break_minutes = excluded.break_minutes,
         worked_minutes = excluded.worked_minutes, status = 'approved', adjust_note = excluded.adjust_note,
         approved_at = excluded.approved_at, approved_by = excluded.approved_by;

  perform app.notify(
    v_asg.worker_user_id, 'timesheet.approved', 'Hours approved: ' || v_job.title,
    left(to_char(v_minutes / 60.0, 'FM990.00') || ' hours approved' || case when v_note is not null then ': ' || v_note else '.' end, 500),
    '/app/worker/timesheets', v_asg.organization_id, v_asg.job_id);
end;
$$;

-- The worker questions approved hours, with a note for the business.
create or replace function public.query_timesheet(p_assignment_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ts public.timesheets;
  v_note text := btrim(coalesce(p_note, ''));
  v_title text;
begin
  select * into v_ts from public.timesheets where assignment_id = p_assignment_id for update;
  if v_ts.assignment_id is null or v_ts.worker_user_id <> auth.uid() then
    raise exception 'Timesheet not found.' using errcode = 'P0002';
  end if;
  if v_ts.status <> 'approved' then
    raise exception 'You already questioned these hours. The business will look at them again.' using errcode = 'P0001';
  end if;
  if v_ts.approved_at < now() - interval '30 days' then
    raise exception 'Hours can be questioned for 30 days after approval. Contact the business or QuickPro support.'
      using errcode = 'P0001';
  end if;
  if char_length(v_note) < 5 or char_length(v_note) > 1000 then
    raise exception 'Say what''s wrong in 5 to 1,000 characters.' using errcode = 'P0001';
  end if;
  update public.timesheets set status = 'queried', query_note = v_note, queried_at = now()
   where assignment_id = p_assignment_id;
  select title into v_title from public.jobs where id = v_ts.job_id;
  perform app.notify_dispatchers(
    v_ts.organization_id, 'timesheet.queried', 'Hours questioned: ' || v_title, v_note,
    '/app/org/' || v_ts.organization_id || '/timesheets', v_ts.job_id);
end;
$$;

-- A business's shifts that have hours to approve or approved, by the local
-- date the shift started, with the worker's name. Members and staff only.
create or replace function public.org_timesheets(p_org_id uuid, p_from date, p_to date)
returns table (
  assignment_id uuid,
  job_id uuid,
  job_title text,
  local_date date,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  worker_user_id uuid,
  worker_name text,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  pay_rate_cents int,
  status public.timesheet_status,
  started_at timestamptz,
  ended_at timestamptz,
  break_minutes int,
  worked_minutes int,
  adjust_note text,
  query_note text,
  approved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.is_org_member(p_org_id) or app.is_admin()) then
    raise exception 'Business not found.' using errcode = 'P0002';
  end if;
  return query
  select a.id, j.id, j.title, (j.starts_at at time zone 'America/New_York')::date, j.starts_at, j.ends_at,
         a.worker_user_id, app.person_name(a.worker_user_id), a.checked_in_at, a.checked_out_at,
         coalesce(t.pay_rate_cents, j.pay_rate_cents), t.status, t.started_at, t.ended_at, t.break_minutes,
         t.worked_minutes, t.adjust_note, t.query_note, t.approved_at
  from public.job_assignments a
  join public.jobs j on j.id = a.job_id
  left join public.timesheets t on t.assignment_id = a.id
  where a.organization_id = p_org_id
    and a.status in ('accepted', 'completed')
    and j.status <> 'cancelled'
    and (j.ends_at <= now() or a.checked_out_at is not null or t.assignment_id is not null)
    and (j.starts_at at time zone 'America/New_York')::date between p_from and p_to
  order by j.starts_at, j.id, app.person_name(a.worker_user_id);
end;
$$;

revoke all on function public.approve_timesheet(uuid, timestamptz, timestamptz, int, text) from public;
revoke all on function public.query_timesheet(uuid, text) from public;
revoke all on function public.org_timesheets(uuid, date, date) from public;
grant execute on function public.approve_timesheet(uuid, timestamptz, timestamptz, int, text) to authenticated;
grant execute on function public.query_timesheet(uuid, text) to authenticated;
grant execute on function public.org_timesheets(uuid, date, date) to authenticated;
