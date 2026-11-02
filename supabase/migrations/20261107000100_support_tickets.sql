-- Support requests: anyone signed in asks QuickPro staff for help, and the
-- two sides talk on the request until staff (or the person) resolve it.
-- Staff can add internal notes that the person never sees.
--
-- Nothing here deletes or drops anything; status and assignment change only
-- through the functions below.

create type public.support_topic as enum (
  'account', 'verification', 'jobs', 'projects', 'billing', 'safety', 'technical', 'other'
);
create type public.support_status as enum (
  'open',      -- waiting on QuickPro staff
  'waiting',   -- staff replied; waiting on the person
  'resolved'
);
create type public.support_priority as enum ('normal', 'high', 'urgent');

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  -- The number people quote: "request #1042".
  ref bigint generated always as identity (start with 1001) unique,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  -- The business it's about, if any; one the person belonged to when they asked.
  organization_id uuid references public.organizations (id) on delete set null,
  topic public.support_topic not null,
  subject text not null check (char_length(subject) between 3 and 120),
  status public.support_status not null default 'open',
  priority public.support_priority not null default 'normal',
  assigned_to uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz not null default now(),
  last_message_side text not null default 'requester' check (last_message_side in ('requester', 'staff')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (resolved_at is not null))
);

create index support_tickets_requester_idx on public.support_tickets (requester_id, last_message_at desc);
create index support_tickets_queue_idx on public.support_tickets (status, last_message_at);
create index support_tickets_assignee_idx on public.support_tickets (assigned_to) where status <> 'resolved';

create trigger support_tickets_touch before update on public.support_tickets
  for each row execute function app.touch_updated_at();

alter table public.support_tickets enable row level security;
create policy "the person who asked and staff read support requests"
  on public.support_tickets for select to authenticated
  using (requester_id = (select auth.uid()) or app.is_admin());
grant select on public.support_tickets to authenticated;

create trigger audit_support_tickets after insert or update or delete on public.support_tickets
  for each row execute function app.audit_row_change('support_ticket', 'id', '');

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_side text not null check (author_side in ('requester', 'staff')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  -- Staff-only notes; never shown to the person who asked.
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  check (not internal or author_side = 'staff')
);

create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);
create index support_messages_author_idx on public.support_messages (author_id, created_at desc);

alter table public.support_messages enable row level security;
create policy "the person who asked reads replies; staff read everything"
  on public.support_messages for select to authenticated
  using (
    app.is_admin()
    or (not internal and exists (
      select 1 from public.support_tickets t where t.id = ticket_id and t.requester_id = (select auth.uid())
    ))
  );
grant select on public.support_messages to authenticated;

create trigger audit_support_messages after insert or update or delete on public.support_messages
  for each row execute function app.audit_row_change('support_message', 'id', '');

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create or replace function app.support_label(p_ticket public.support_tickets)
returns text
language sql
immutable
set search_path = ''
as $$
  select '#' || p_ticket.ref || ' ' || p_ticket.subject;
$$;

create or replace function app.check_support_body(p_body text, p_min int)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_body) < greatest(p_min, 1) then
    if p_min > 1 then
      raise exception 'Describe what you need help with (at least % characters).', p_min using errcode = 'P0001';
    end if;
    raise exception 'Write a message first.' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Keep messages under 4,000 characters.' using errcode = 'P0001';
  end if;
  return v_body;
end;
$$;

create or replace function public.open_support_ticket(
  p_topic public.support_topic, p_subject text, p_body text, p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text;
  v_ticket public.support_tickets;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  if p_topic is null then
    raise exception 'Choose what it''s about.' using errcode = 'P0001';
  end if;
  if char_length(v_subject) < 3 then
    raise exception 'Add a short subject.' using errcode = 'P0001';
  end if;
  if char_length(v_subject) > 120 then
    raise exception 'Keep the subject under 120 characters.' using errcode = 'P0001';
  end if;
  v_body := app.check_support_body(p_body, 10);
  if p_organization_id is not null and not app.is_org_member(p_organization_id) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.support_tickets where requester_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve opened several requests today. Add to one of them instead.' using errcode = 'P0001';
  end if;

  insert into public.support_tickets (requester_id, organization_id, topic, subject, priority)
  values (auth.uid(), p_organization_id, p_topic, v_subject, (case when p_topic = 'safety' then 'urgent' else 'normal' end)::public.support_priority)
  returning * into v_ticket;
  insert into public.support_messages (ticket_id, author_id, author_side, body)
  values (v_ticket.id, auth.uid(), 'requester', v_body);

  perform app.notify_staff(
    'support.opened',
    case when p_topic = 'safety' then 'Urgent support request ' else 'Support request ' end || app.support_label(v_ticket),
    coalesce(app.person_name(auth.uid()), 'Someone') || ': ' || left(v_body, 300),
    '/app/admin/support/' || v_ticket.id
  );
  return v_ticket.id;
end;
$$;

-- The person replies (reopening a recently resolved request), or staff reply
-- or add an internal note.
create or replace function public.post_support_message(p_ticket_id uuid, p_body text, p_internal boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.support_tickets;
  v_side text;
  v_body text;
  v_internal boolean := coalesce(p_internal, false);
  v_id uuid;
begin
  select * into v_t from public.support_tickets where id = p_ticket_id for update;
  if v_t.id is not null and v_t.requester_id = auth.uid() then
    v_side := 'requester';
  elsif v_t.id is not null and app.is_admin() then
    v_side := 'staff';
  end if;
  if v_side is null then
    raise exception 'Support request not found.' using errcode = 'P0002';
  end if;
  if v_internal and v_side <> 'staff' then
    raise exception 'Only QuickPro staff can add internal notes.' using errcode = 'P0001';
  end if;
  v_body := app.check_support_body(p_body, 1);
  if (select count(*) from public.support_messages where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'You''re sending messages too quickly. Wait a minute and try again.' using errcode = 'P0001';
  end if;
  if v_side = 'requester' and v_t.status = 'resolved' and v_t.resolved_at < now() - interval '30 days' then
    raise exception 'This request was resolved more than 30 days ago. Open a new one.' using errcode = 'P0001';
  end if;

  insert into public.support_messages (ticket_id, author_id, author_side, body, internal)
  values (v_t.id, auth.uid(), v_side, v_body, v_internal)
  returning id into v_id;

  if v_internal then
    return v_id;
  end if;

  if v_side = 'requester' then
    -- Back to staff; a reply reopens a resolved request.
    update public.support_tickets
       set status = 'open', resolved_at = null, resolved_by = null,
           last_message_at = now(), last_message_side = 'requester'
     where id = v_t.id;
    if v_t.assigned_to is not null then
      perform app.notify(v_t.assigned_to, 'support.message', 'Reply on ' || app.support_label(v_t),
        coalesce(app.person_name(auth.uid()), 'The requester') || ': ' || left(v_body, 300), '/app/admin/support/' || v_t.id, null, null);
    else
      perform app.notify_staff('support.message', 'Reply on ' || app.support_label(v_t),
        coalesce(app.person_name(auth.uid()), 'The requester') || ': ' || left(v_body, 300), '/app/admin/support/' || v_t.id);
    end if;
  else
    -- A staff reply waits on the person unless staff resolve it separately.
    update public.support_tickets
       set status = case when status = 'resolved' then 'resolved'::public.support_status else 'waiting' end,
           assigned_to = coalesce(assigned_to, auth.uid()),
           last_message_at = now(), last_message_side = 'staff'
     where id = v_t.id;
    perform app.notify(v_t.requester_id, 'support.reply', 'QuickPro support replied: ' || app.support_label(v_t),
      left(v_body, 300), '/app/support/' || v_t.id, v_t.organization_id, null);
  end if;
  return v_id;
end;
$$;

-- Staff: status, priority and who's handling it.
create or replace function public.update_support_ticket(
  p_ticket_id uuid, p_status public.support_status, p_priority public.support_priority, p_assigned_to uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.support_tickets;
begin
  if not app.is_admin() then
    raise exception 'Support request not found.' using errcode = 'P0002';
  end if;
  select * into v_t from public.support_tickets where id = p_ticket_id for update;
  if v_t.id is null then
    raise exception 'Support request not found.' using errcode = 'P0002';
  end if;
  if p_status is null or p_priority is null then
    raise exception 'Choose a status and a priority.' using errcode = 'P0001';
  end if;
  if p_assigned_to is not null
     and not exists (select 1 from public.profiles where id = p_assigned_to and platform_role = 'admin') then
    raise exception 'Assign the request to a QuickPro staff member.' using errcode = 'P0001';
  end if;

  update public.support_tickets
     set status = p_status,
         priority = p_priority,
         assigned_to = p_assigned_to,
         resolved_at = case when p_status = 'resolved' then coalesce(resolved_at, now()) end,
         resolved_by = case when p_status = 'resolved' then coalesce(resolved_by, auth.uid()) end
   where id = v_t.id;

  if p_status = 'resolved' and v_t.status <> 'resolved' then
    perform app.notify(v_t.requester_id, 'support.resolved', 'Resolved: ' || app.support_label(v_t),
      'QuickPro staff marked your request resolved. Reply within 30 days to reopen it.', '/app/support/' || v_t.id, v_t.organization_id, null);
  end if;
  if p_assigned_to is not null and p_assigned_to is distinct from v_t.assigned_to then
    perform app.notify(p_assigned_to, 'support.assigned', 'Assigned to you: ' || app.support_label(v_t),
      '', '/app/admin/support/' || v_t.id, null, null);
  end if;
end;
$$;

-- The person says it's sorted.
create or replace function public.resolve_my_support_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.support_tickets;
begin
  select * into v_t from public.support_tickets where id = p_ticket_id and requester_id = auth.uid() for update;
  if v_t.id is null then
    raise exception 'Support request not found.' using errcode = 'P0002';
  end if;
  if v_t.status = 'resolved' then
    raise exception 'This request is already resolved.' using errcode = 'P0001';
  end if;
  update public.support_tickets
     set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
   where id = v_t.id;
  if v_t.assigned_to is not null then
    perform app.notify(v_t.assigned_to, 'support.resolved', 'Resolved by the requester: ' || app.support_label(v_t),
      '', '/app/admin/support/' || v_t.id, null, null);
  end if;
end;
$$;

revoke all on function app.support_label(public.support_tickets) from public;
revoke all on function app.check_support_body(text, int) from public;
revoke all on function public.open_support_ticket(public.support_topic, text, text, uuid) from public;
revoke all on function public.post_support_message(uuid, text, boolean) from public;
revoke all on function public.update_support_ticket(uuid, public.support_status, public.support_priority, uuid) from public;
revoke all on function public.resolve_my_support_ticket(uuid) from public;
grant execute on function public.open_support_ticket(public.support_topic, text, text, uuid) to authenticated;
grant execute on function public.post_support_message(uuid, text, boolean) to authenticated;
grant execute on function public.update_support_ticket(uuid, public.support_status, public.support_priority, uuid) to authenticated;
grant execute on function public.resolve_my_support_ticket(uuid) to authenticated;
