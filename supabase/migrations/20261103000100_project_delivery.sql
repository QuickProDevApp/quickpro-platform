-- Project delivery: from an awarded request to confirmed completion.
--
-- Once a customer awards a request, the winning contractor schedules jobs
-- for it (jobs.service_request_id) and staffs them through the existing job
-- workflow (applications, offers, check-in and check-out). The customer
-- follows the work: each job's status, how many people are booked, and who
-- checked in and out. The two businesses message each other on the request.
--
-- Completion has two steps. The contractor reports the work complete once
-- every job on the project is completed or cancelled; the customer then
-- confirms it, or sends it back with a reason. Staff can still close a
-- request directly.
--
-- Each step is written to service_request_events, the project's history,
-- which the customer, the awarded contractor and staff can read.
--
-- Additive only: new columns, tables and functions, and replaced function
-- bodies. No data is changed or removed.

-- ---------------------------------------------------------------------------
-- Requests: requirements and the completion hand-off
-- ---------------------------------------------------------------------------
alter table public.service_requests
  add column requirements text not null default '' check (char_length(requirements) <= 2000),
  add column work_completed_at timestamptz,
  add column work_completed_by uuid references public.profiles (id) on delete set null,
  add column completion_note text check (completion_note is null or char_length(completion_note) <= 1000),
  add column confirmed_by uuid references public.profiles (id) on delete set null;

grant insert (requirements) on public.service_requests to authenticated;
grant update (requirements) on public.service_requests to authenticated;

-- People edit only open requests. Workflow functions change status and the
-- completion columns (which people cannot write: they are not granted).
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
    if old.status <> 'open' and not app.is_admin()
       and (new.title, new.description, new.category_id, new.service_area_id, new.preferred_start, new.preferred_end,
            new.budget_min_cents, new.budget_max_cents, new.requirements)
           is distinct from
           (old.title, old.description, old.category_id, old.service_area_id, old.preferred_start, old.preferred_end,
            old.budget_min_cents, old.budget_max_cents, old.requirements) then
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

-- The contractor whose quote won, or null.
create or replace function app.awarded_contractor(p_request_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select q.contractor_id from public.service_requests r join public.quotes q on q.id = r.awarded_quote_id
   where r.id = p_request_id and r.status in ('awarded', 'completed');
$$;

-- ---------------------------------------------------------------------------
-- Jobs belong to a project
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column service_request_id uuid references public.service_requests (id) on delete set null;

create index jobs_service_request_idx on public.jobs (service_request_id) where service_request_id is not null;

grant insert (service_request_id) on public.jobs to authenticated;

-- A job can be scheduled for a project only by the contractor that won it,
-- while the work is still in progress. The link never changes afterwards.
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
  if not found or v_req.status <> 'awarded' or app.awarded_contractor(v_req.id) is distinct from new.organization_id then
    raise exception 'Jobs can be scheduled only for projects awarded to your business.' using errcode = 'P0001';
  end if;
  if v_req.work_completed_at is not null then
    raise exception 'You reported this project complete. Ask the customer to send it back before adding jobs.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger jobs_check_project before insert or update of service_request_id on public.jobs
  for each row execute function app.check_job_project();

-- ---------------------------------------------------------------------------
-- Project history
-- ---------------------------------------------------------------------------
create table public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_.]{3,40}$'),
  summary text not null check (char_length(summary) between 1 and 300),
  detail text not null default '' check (char_length(detail) <= 1000),
  job_id uuid references public.jobs (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  -- Who acted, as the other parties should see it (profiles are private).
  actor_label text not null default '' check (char_length(actor_label) <= 120),
  created_at timestamptz not null default now()
);

create index service_request_events_request_idx on public.service_request_events (request_id, created_at);

alter table public.service_request_events enable row level security;

-- The customer, the awarded contractor and staff (the same people who see the site).
create policy "customer, awarded contractor and staff read project history"
  on public.service_request_events for select to authenticated
  using (app.can_see_request_site(request_id));

grant select on public.service_request_events to authenticated;

create trigger audit_service_request_events after insert or update or delete on public.service_request_events
  for each row execute function app.audit_row_change('service_request_event', 'id', '');

create or replace function app.log_request_event(
  p_request_id uuid, p_kind text, p_summary text, p_detail text, p_job_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.service_request_events (request_id, kind, summary, detail, job_id, actor_id, actor_label)
  values (p_request_id, p_kind, left(p_summary, 300), left(coalesce(p_detail, ''), 1000), p_job_id, auth.uid(),
          case when auth.uid() is null then ''
               when app.is_admin() then 'QuickPro staff'
               else left(coalesce(app.person_name(auth.uid()), ''), 120) end);
$$;

create or replace function app.log_request_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_contractor text;
begin
  if tg_op = 'INSERT' then
    perform app.log_request_event(new.id, 'request.posted', 'Request posted', '', null);
    return null;
  end if;
  if new.status is distinct from old.status then
    case new.status
      when 'awarded' then
        select * into v_quote from public.quotes where id = new.awarded_quote_id;
        select name into v_contractor from public.organizations where id = v_quote.contractor_id;
        perform app.log_request_event(new.id, 'request.awarded',
          'Awarded to ' || coalesce(v_contractor, 'a contractor') || ' for ' || to_char(v_quote.amount_cents / 100.0, 'FM$999,999,990.00'),
          '', null);
      when 'cancelled' then
        perform app.log_request_event(new.id, 'request.cancelled', 'Request cancelled', coalesce(new.cancel_reason, ''), null);
      when 'completed' then
        perform app.log_request_event(new.id, 'request.completed',
          case when new.confirmed_by is not null then 'Customer confirmed the work is complete' else 'Closed as complete by QuickPro staff' end,
          '', null);
      else
        null;
    end case;
  end if;
  return null;
end;
$$;

create trigger log_service_requests after insert or update of status on public.service_requests
  for each row execute function app.log_request_change();

create or replace function app.log_project_job_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_request_id is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform app.log_request_event(new.service_request_id, 'job.scheduled', 'Job scheduled: ' || new.title,
      app.job_when(new.starts_at) || ' · ' || new.headcount || case when new.headcount = 1 then ' person' else ' people' end,
      new.id);
  elsif new.status is distinct from old.status and new.status in ('completed', 'cancelled') then
    perform app.log_request_event(new.service_request_id, 'job.' || new.status,
      case new.status when 'completed' then 'Job completed: ' else 'Job cancelled: ' end || new.title,
      case when new.status = 'cancelled' then coalesce(new.cancel_reason, '') else '' end,
      new.id);
  end if;
  return null;
end;
$$;

create trigger log_project_jobs after insert or update of status on public.jobs
  for each row execute function app.log_project_job_change();

-- ---------------------------------------------------------------------------
-- What the customer sees of the work
-- ---------------------------------------------------------------------------

-- The project's jobs with their staffing and attendance counts. For the
-- customer, the awarded contractor and staff.
create or replace function public.request_jobs(p_request_id uuid)
returns table (
  id uuid,
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
begin
  if not app.can_see_request_site(p_request_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  return query
  select j.id, j.title, j.status, j.starts_at, j.ends_at, j.headcount,
         (select count(*)::int from public.job_assignments a where a.job_id = j.id and a.status in ('accepted', 'completed')),
         (select count(*)::int from public.job_assignments a where a.job_id = j.id and a.status in ('accepted', 'completed') and a.checked_in_at is not null),
         (select count(*)::int from public.job_assignments a where a.job_id = j.id and a.status in ('accepted', 'completed') and a.checked_out_at is not null),
         j.completed_at
  from public.jobs j
  where j.service_request_id = p_request_id
  order by j.starts_at, j.id;
end;
$$;

-- Who is booked on the project's jobs and when they checked in and out.
-- Names only: workers' phone numbers and profiles stay with the contractor.
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
begin
  if not app.can_see_request_site(p_request_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  return query
  select a.job_id, app.person_name(a.worker_user_id), a.status, a.checked_in_at, a.checked_out_at
  from public.job_assignments a
  join public.jobs j on j.id = a.job_id
  where j.service_request_id = p_request_id and a.status in ('accepted', 'completed')
  order by j.starts_at, a.job_id, a.checked_in_at nulls last, 2;
end;
$$;

-- ---------------------------------------------------------------------------
-- Completion
-- ---------------------------------------------------------------------------
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

create or replace function public.confirm_request_completion(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found or not app.can_dispatch(v_req.organization_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'awarded' then
    raise exception 'This request is %.', v_req.status using errcode = 'P0001';
  end if;
  if v_req.work_completed_at is null then
    raise exception 'The contractor hasn''t reported the work complete yet.' using errcode = 'P0001';
  end if;
  update public.service_requests
     set status = 'completed', completed_at = now(), confirmed_by = auth.uid()
   where id = p_request_id;
end;
$$;

-- The customer sends reported work back to the contractor with a reason.
create or replace function public.reopen_request_work(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
  v_contractor uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found or not app.can_dispatch(v_req.organization_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_req.status <> 'awarded' or v_req.work_completed_at is null then
    raise exception 'Only work the contractor reported complete can be sent back.' using errcode = 'P0001';
  end if;
  if v_reason = '' then
    raise exception 'Tell the contractor what still needs doing.' using errcode = 'P0001';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'Keep the reason under 1,000 characters.' using errcode = 'P0001';
  end if;
  v_contractor := app.awarded_contractor(p_request_id);
  update public.service_requests
     set work_completed_at = null, work_completed_by = null, completion_note = null
   where id = p_request_id;
  perform app.log_request_event(p_request_id, 'work.reopened', 'Customer sent the work back', v_reason, null);
  perform app.notify_dispatchers(v_contractor, 'request.work_reopened', 'Not finished yet: ' || v_req.title,
    left(v_reason, 400), '/app/org/' || v_contractor || '/requests/' || v_req.id, null);
end;
$$;

-- Staff only now: customers confirm completion after the contractor reports it.
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
  if not found or not (app.is_admin() or app.can_dispatch(v_req.organization_id)) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if not app.is_admin() then
    raise exception 'Confirm completion once the contractor reports the work complete.' using errcode = 'P0001';
  end if;
  if v_req.status <> 'awarded' then
    raise exception 'Only awarded work can be marked complete.' using errcode = 'P0001';
  end if;
  update public.service_requests set status = 'completed', completed_at = now() where id = p_request_id;
end;
$$;

-- Notifications on status changes (completion text now says who confirmed).
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
    perform app.notify_dispatchers(new.organization_id, 'request.cancelled', 'Request cancelled: ' || new.title,
      coalesce(new.cancel_reason, ''), '/app/org/' || new.organization_id || '/requests/' || new.id, null);
    for v_quote in select * from public.quotes where request_id = new.id and status in ('declined', 'withdrawn', 'accepted', 'submitted') loop
      perform app.notify_dispatchers(v_quote.contractor_id, 'request.cancelled', 'Request cancelled: ' || new.title,
        coalesce(new.cancel_reason, ''), '/app/org/' || v_quote.contractor_id || '/requests/' || new.id, null);
    end loop;
  elsif new.status = 'completed' then
    select * into v_quote from public.quotes where id = new.awarded_quote_id;
    if found then
      perform app.notify_dispatchers(v_quote.contractor_id, 'request.completed', new.title || ' is complete',
        case when new.confirmed_by is not null then v_customer || ' confirmed the work is complete.'
             else 'QuickPro staff closed the project as complete.' end,
        '/app/org/' || v_quote.contractor_id || '/requests/' || new.id, null);
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Messages between the customer and the awarded contractor
-- ---------------------------------------------------------------------------
create table public.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_org_id uuid references public.organizations (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index request_messages_request_idx on public.request_messages (request_id, created_at);
create index request_messages_author_idx on public.request_messages (author_id, created_at desc);

alter table public.request_messages enable row level security;

-- Rows are visible to the two businesses and staff; the text is read through request_thread().
create policy "customer, awarded contractor and staff see request messages"
  on public.request_messages for select to authenticated
  using (app.can_see_request_site(request_id));
grant select (id, request_id, author_id, author_org_id, created_at) on public.request_messages to authenticated;

create trigger audit_request_messages after insert or update or delete on public.request_messages
  for each row execute function app.audit_row_change('request_message', 'id', 'author_org_id');

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
  where m.request_id = p_request_id
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

  -- One unread notification per person per project, updated with the latest message.
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function app.awarded_contractor(uuid) from public;
revoke all on function app.check_job_project() from public;
revoke all on function app.log_request_event(uuid, text, text, text, uuid) from public;
revoke all on function app.log_request_change() from public;
revoke all on function app.log_project_job_change() from public;
grant execute on function app.awarded_contractor(uuid) to authenticated;

revoke all on function public.request_jobs(uuid) from public;
revoke all on function public.request_attendance(uuid) from public;
revoke all on function public.report_request_work_complete(uuid, text) from public;
revoke all on function public.confirm_request_completion(uuid) from public;
revoke all on function public.reopen_request_work(uuid, text) from public;
revoke all on function public.request_thread(uuid) from public;
revoke all on function public.post_request_message(uuid, text) from public;
grant execute on function public.request_jobs(uuid) to authenticated;
grant execute on function public.request_attendance(uuid) to authenticated;
grant execute on function public.report_request_work_complete(uuid, text) to authenticated;
grant execute on function public.confirm_request_completion(uuid) to authenticated;
grant execute on function public.reopen_request_work(uuid, text) to authenticated;
grant execute on function public.request_thread(uuid) to authenticated;
grant execute on function public.post_request_message(uuid, text) to authenticated;
