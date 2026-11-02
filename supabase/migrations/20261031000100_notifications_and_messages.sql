-- In-app notifications and job message threads.
--
-- Notifications are written by triggers on the workflow tables, so every
-- path that changes an application, offer, booking or review tells the
-- people affected, whichever function made the change. Nobody is notified
-- about their own action. QuickPro does not send email or SMS yet; these
-- appear in the app only.
--
-- Each job has one message thread shared by the business (any member),
-- workers who were offered or booked on it, and QuickPro staff. Staff can
-- hide a message; hidden text is withheld from everyone but staff.

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]+\.[a-z_]+$'),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 500),
  link_path text check (link_path is null or link_path ~ '^/app(/[A-Za-z0-9/_-]*)?$'),
  organization_id uuid references public.organizations (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "people read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

grant select (id, user_id, kind, title, body, link_path, organization_id, job_id, created_at, read_at)
  on public.notifications to authenticated;

-- Inserts only: the record of what someone was told. Read marks are not audited.
create trigger audit_notifications after insert or delete on public.notifications
  for each row execute function app.audit_row_change('notification', 'id', 'organization_id');

-- Writes a notification unless it is for the person acting.
create or replace function app.notify(
  p_user_id uuid, p_kind text, p_title text, p_body text, p_link text, p_org_id uuid, p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_user_id is not distinct from auth.uid() then
    return;
  end if;
  insert into public.notifications (user_id, kind, title, body, link_path, organization_id, job_id)
  values (p_user_id, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 500), p_link, p_org_id, p_job_id);
end;
$$;

-- Owners, admins and dispatchers: the people who run jobs.
create or replace function app.notify_dispatchers(
  p_org_id uuid, p_kind text, p_title text, p_body text, p_link text, p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select user_id from public.organization_members
    where organization_id = p_org_id and role in ('owner', 'admin', 'dispatcher')
  loop
    perform app.notify(v_user, p_kind, p_title, p_body, p_link, p_org_id, p_job_id);
  end loop;
end;
$$;

create or replace function app.notify_managers(p_org_id uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select user_id from public.organization_members where organization_id = p_org_id and role in ('owner', 'admin')
  loop
    perform app.notify(v_user, p_kind, p_title, p_body, p_link, p_org_id, null);
  end loop;
end;
$$;

create or replace function app.job_when(p_starts_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$ select to_char(p_starts_at at time zone 'America/New_York', 'Dy Mon FMDD, FMHH12:MI AM'); $$;

create or replace function app.person_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(nullif(full_name, ''), 'A worker') from public.profiles where id = p_user_id; $$;

-- Applications: the business hears about new applicants and withdrawals;
-- the worker hears when they are passed over.
create or replace function app.notify_application_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
  v_org_link text;
begin
  select * into v_job from public.jobs where id = new.job_id;
  v_org_link := '/app/org/' || v_job.organization_id || '/jobs/' || v_job.id;
  if tg_op = 'INSERT' then
    perform app.notify_dispatchers(v_job.organization_id, 'application.received',
      app.person_name(new.worker_user_id) || ' applied to ' || v_job.title,
      coalesce(nullif(new.note, ''), 'No note.'), v_org_link, v_job.id);
  elsif new.status is distinct from old.status then
    if new.status = 'declined' then
      perform app.notify(new.worker_user_id, 'application.declined',
        'Not selected for ' || v_job.title,
        coalesce(nullif(new.decision_note, ''), 'The business chose other applicants this time.'),
        '/app/worker/jobs/' || v_job.id, v_job.organization_id, v_job.id);
    elsif new.status = 'withdrawn' then
      perform app.notify_dispatchers(v_job.organization_id, 'application.withdrawn',
        app.person_name(new.worker_user_id) || ' withdrew from ' || v_job.title, '', v_org_link, v_job.id);
    end if;
  end if;
  return null;
end;
$$;

create trigger notify_job_applications after insert or update of status on public.job_applications
  for each row execute function app.notify_application_change();

-- Offers and bookings.
create or replace function app.notify_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
  v_org_name text;
  v_worker text;
  v_worker_link text;
  v_org_link text;
begin
  select * into v_job from public.jobs where id = new.job_id;
  select name into v_org_name from public.organizations where id = v_job.organization_id;
  v_worker := app.person_name(new.worker_user_id);
  v_worker_link := '/app/worker/jobs/' || v_job.id;
  v_org_link := '/app/org/' || v_job.organization_id || '/jobs/' || v_job.id;

  if tg_op = 'INSERT' then
    if new.status = 'offered' then
      perform app.notify(new.worker_user_id, 'offer.received', v_org_name || ' offered you ' || v_job.title,
        app.job_when(v_job.starts_at) || '. Accept or decline from the job page.', v_worker_link, v_job.organization_id, v_job.id);
    end if;
    return null;
  end if;
  if new.status is not distinct from old.status then
    return null;
  end if;

  case new.status
    when 'accepted' then
      perform app.notify_dispatchers(v_job.organization_id, 'offer.accepted',
        v_worker || ' accepted ' || v_job.title, app.job_when(v_job.starts_at), v_org_link, v_job.id);
    when 'declined' then
      perform app.notify_dispatchers(v_job.organization_id, 'offer.declined',
        v_worker || ' declined ' || v_job.title, '', v_org_link, v_job.id);
    when 'cancelled' then
      if new.cancelled_by = new.worker_user_id then
        perform app.notify_dispatchers(v_job.organization_id, 'booking.worker_cancelled',
          v_worker || ' cancelled on ' || v_job.title, coalesce(new.cancel_reason, ''), v_org_link, v_job.id);
      elsif new.cancelled_by is not null then
        perform app.notify(new.worker_user_id, 'booking.cancelled',
          case when old.status = 'offered' then 'Offer withdrawn: ' else 'Booking cancelled: ' end || v_job.title,
          coalesce(new.cancel_reason, ''), v_worker_link, v_job.organization_id, v_job.id);
      else
        perform app.notify(new.worker_user_id, 'offer.lapsed', 'Offer lapsed: ' || v_job.title,
          coalesce(new.cancel_reason, ''), v_worker_link, v_job.organization_id, v_job.id);
      end if;
    when 'completed' then
      perform app.notify(new.worker_user_id, 'booking.completed', v_job.title || ' is marked complete',
        'Thanks for working with ' || v_org_name || '.', v_worker_link, v_job.organization_id, v_job.id);
    else
      null;
  end case;
  return null;
end;
$$;

create trigger notify_job_assignments after insert or update of status on public.job_assignments
  for each row execute function app.notify_assignment_change();

-- Staff review decisions.
create or replace function app.notify_organization_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected', 'suspended') then
    perform app.notify_managers(new.id, 'organization.' || new.status::text,
      case new.status
        when 'approved' then new.name || ' is approved'
        when 'rejected' then new.name || ' needs changes'
        else new.name || ' is suspended'
      end,
      coalesce(new.review_notes, ''), '/app/org/' || new.id);
  end if;
  return null;
end;
$$;

create trigger notify_organization_review after update of status on public.organizations
  for each row execute function app.notify_organization_review();

create or replace function app.notify_worker_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected', 'suspended') then
    perform app.notify(new.user_id, 'worker_profile.' || new.status::text,
      case new.status
        when 'approved' then 'Your worker profile is approved'
        when 'rejected' then 'Your worker profile needs changes'
        else 'Your worker profile is suspended'
      end,
      coalesce(new.review_notes, ''), '/app/worker', null, null);
  end if;
  return null;
end;
$$;

create trigger notify_worker_review after update of status on public.worker_profiles
  for each row execute function app.notify_worker_review();

create or replace function app.notify_document_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    v_title := case new.status when 'approved' then 'Document approved: ' else 'Document not accepted: ' end || new.title;
    if new.organization_id is not null then
      perform app.notify_managers(new.organization_id, 'document.' || new.status::text, v_title,
        coalesce(new.review_notes, ''), '/app/org/' || new.organization_id || '/documents');
    else
      perform app.notify(new.worker_user_id, 'document.' || new.status::text, v_title,
        coalesce(new.review_notes, ''), '/app/worker/documents', null, null);
    end if;
  end if;
  return null;
end;
$$;

create trigger notify_document_review after update of status on public.qualification_documents
  for each row execute function app.notify_document_review();

create or replace function app.notify_invitation_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_name text;
begin
  if old.accepted_at is null and new.accepted_at is not null then
    select name into v_org_name from public.organizations where id = new.organization_id;
    perform app.notify(new.invited_by, 'invitation.accepted',
      app.person_name(new.accepted_by) || ' joined ' || v_org_name, 'They joined as ' || new.role::text || '.',
      '/app/org/' || new.organization_id || '/team', new.organization_id, null);
  end if;
  return null;
end;
$$;

create trigger notify_invitation_accepted after update of accepted_at on public.organization_invitations
  for each row execute function app.notify_invitation_accepted();

-- Marks the caller's notifications read: the given ones, or all when null.
create or replace function public.mark_notifications_read(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job message threads
-- ---------------------------------------------------------------------------
create table public.job_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 500)
);

create index job_messages_job_idx on public.job_messages (job_id, created_at);
create index job_messages_author_idx on public.job_messages (author_id, created_at desc);

alter table public.job_messages enable row level security;

-- Business members, staff, and workers offered or booked on the job.
create or replace function app.in_job_thread(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin()
      or exists (select 1 from public.jobs j where j.id = p_job_id and app.is_org_member(j.organization_id))
      or exists (
        select 1 from public.job_assignments
        where job_id = p_job_id and worker_user_id = (select auth.uid()) and status in ('offered', 'accepted', 'completed')
      );
$$;

-- Rows are visible to the thread; the text is read through job_thread(),
-- which withholds hidden messages. The body column is not granted.
create policy "thread members read job messages"
  on public.job_messages for select to authenticated
  using (app.in_job_thread(job_id));

grant select (id, job_id, organization_id, author_id, created_at, hidden_at)
  on public.job_messages to authenticated;

create trigger audit_job_messages after insert or update or delete on public.job_messages
  for each row execute function app.audit_row_change('job_message', 'id', 'organization_id');

create or replace function public.job_thread(p_job_id uuid)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_side text,
  body text,
  created_at timestamptz,
  hidden boolean,
  hidden_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_staff boolean := app.is_admin();
begin
  select organization_id into v_org from public.jobs where jobs.id = p_job_id;
  if v_org is null or not app.in_job_thread(p_job_id) then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;
  return query
  select m.id, m.author_id, coalesce(nullif(p.full_name, ''), 'Former member'),
         case
           when exists (select 1 from public.organization_members om where om.organization_id = v_org and om.user_id = m.author_id) then 'business'
           when exists (select 1 from public.job_assignments a where a.job_id = p_job_id and a.worker_user_id = m.author_id) then 'worker'
           when p.platform_role = 'admin' then 'staff'
           else 'former'
         end,
         case when m.hidden_at is null or v_staff then m.body end,
         m.created_at,
         m.hidden_at is not null,
         case when v_staff then m.hidden_reason end
  from public.job_messages m
  left join public.profiles p on p.id = m.author_id
  where m.job_id = p_job_id
  order by m.created_at, m.id;
end;
$$;

create or replace function public.post_job_message(p_job_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_author text;
  v_preview text;
  v_user uuid;
  v_link text;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found or not app.in_job_thread(p_job_id) then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;
  if v_body = '' then
    raise exception 'Write a message first.' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep messages under 2,000 characters.' using errcode = 'P0001';
  end if;
  if v_job.status in ('cancelled', 'completed') and v_job.ends_at < now() - interval '7 days' then
    raise exception 'Messages on this job are closed.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.job_messages
      where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'You''re sending messages too quickly. Wait a minute and try again.' using errcode = 'P0001';
  end if;

  insert into public.job_messages (job_id, organization_id, author_id, body)
  values (p_job_id, v_job.organization_id, auth.uid(), v_body)
  returning id into v_id;

  -- One unread notification per person per job, updated with the latest message.
  v_author := app.person_name(auth.uid());
  v_preview := v_author || ': ' || left(v_body, 160);
  for v_user, v_link in
    select om.user_id, '/app/org/' || v_job.organization_id || '/jobs/' || v_job.id
      from public.organization_members om
     where om.organization_id = v_job.organization_id and om.role in ('owner', 'admin', 'dispatcher')
    union
    select a.worker_user_id, '/app/worker/jobs/' || v_job.id
      from public.job_assignments a
     where a.job_id = p_job_id and a.status in ('offered', 'accepted')
  loop
    continue when v_user = auth.uid();
    update public.notifications
       set body = left(v_preview, 500), created_at = now()
     where user_id = v_user and job_id = p_job_id and kind = 'job.message' and read_at is null;
    if not found then
      perform app.notify(v_user, 'job.message', 'New message on ' || v_job.title, v_preview, v_link, v_job.organization_id, v_job.id);
    end if;
  end loop;
  return v_id;
end;
$$;

-- Staff moderation. The message stays in the audit log.
create or replace function public.hide_job_message(p_message_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Only QuickPro staff can hide messages.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Add a short reason.' using errcode = 'P0001';
  end if;
  update public.job_messages
     set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = left(btrim(p_reason), 500)
   where id = p_message_id and hidden_at is null;
  if not found then
    raise exception 'Message not found or already hidden.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function app.notify(uuid, text, text, text, text, uuid, uuid) from public;
revoke all on function app.notify_dispatchers(uuid, text, text, text, text, uuid) from public;
revoke all on function app.notify_managers(uuid, text, text, text, text) from public;
revoke all on function app.person_name(uuid) from public;
revoke all on function app.notify_application_change() from public;
revoke all on function app.notify_assignment_change() from public;
revoke all on function app.notify_organization_review() from public;
revoke all on function app.notify_worker_review() from public;
revoke all on function app.notify_document_review() from public;
revoke all on function app.notify_invitation_accepted() from public;
revoke all on function app.in_job_thread(uuid) from public;
grant execute on function app.in_job_thread(uuid) to authenticated;

revoke all on function public.mark_notifications_read(uuid[]) from public;
revoke all on function public.job_thread(uuid) from public;
revoke all on function public.post_job_message(uuid, text) from public;
revoke all on function public.hide_job_message(uuid, text) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.job_thread(uuid) to authenticated;
grant execute on function public.post_job_message(uuid, text) to authenticated;
grant execute on function public.hide_job_message(uuid, text) to authenticated;
