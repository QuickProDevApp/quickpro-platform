-- Email for notifications. Every in-app notification is also queued for
-- email to the person's sign-in address, unless they turned emails off.
-- The app's mailer drains the queue through a narrow database role that can
-- only claim queued emails and record the result; it can't read or change
-- anything else.
--
-- Nothing here deletes or drops anything. It adds columns, a preferences
-- table, a role and functions. Notifications older than a day when the
-- mailer first sees them are marked skipped instead of sent, so turning on
-- a mail provider later doesn't send a backlog.

alter table public.notifications
  add column email_status text check (email_status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  add column email_attempts int not null default 0,
  add column email_claimed_at timestamptz,
  add column emailed_at timestamptz,
  add column email_error text check (email_error is null or char_length(email_error) <= 500);

create index notifications_email_queue_idx on public.notifications (created_at)
  where email_status in ('pending', 'sending');

-- One row per person who changed their settings; no row means the defaults.
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "people read their own notification settings"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.notification_preferences to authenticated;

create trigger audit_notification_preferences after insert or update or delete on public.notification_preferences
  for each row execute function app.audit_row_change('notification_preferences', 'user_id', '');

create or replace function public.set_email_notifications(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  insert into public.notification_preferences (user_id, email_enabled, updated_at)
  values (auth.uid(), coalesce(p_enabled, true), now())
  on conflict (user_id) do update set email_enabled = excluded.email_enabled, updated_at = now();
  -- Turning emails off also drops what is still waiting to be sent.
  if not coalesce(p_enabled, true) then
    update public.notifications set email_status = 'skipped'
     where user_id = auth.uid() and email_status = 'pending';
  end if;
end;
$$;

-- New notifications are queued for email unless the person turned it off.
create or replace function app.before_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email_attempts := 0;
  new.email_claimed_at := null;
  new.emailed_at := null;
  new.email_error := null;
  new.email_status := case
    when coalesce((select p.email_enabled from public.notification_preferences p where p.user_id = new.user_id), true)
      then 'pending' else 'skipped' end;
  return new;
end;
$$;

create trigger notifications_before_insert before insert on public.notifications
  for each row execute function app.before_notification_insert();

-- The mailer's role. No login; the server switches to it for one
-- transaction at a time (the same way it switches to `authenticated`).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'quickpro_mailer') then
    create role quickpro_mailer nologin noinherit;
  end if;
end;
$$;
grant quickpro_mailer to current_user;
grant usage on schema app to quickpro_mailer;

-- Claim up to p_limit queued emails, oldest first. Emails stuck in sending
-- for ten minutes (a crashed send) are claimed again. Queued emails older
-- than a day are marked skipped rather than sent late.
create or replace function app.claim_email_batch(p_limit int)
returns table (
  notification_id uuid,
  to_email text,
  to_name text,
  kind text,
  title text,
  body text,
  link_path text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications set email_status = 'skipped', email_error = 'Older than a day when the mailer ran.'
   where email_status in ('pending', 'sending') and notifications.created_at < now() - interval '1 day';
  update public.notifications n set email_status = 'skipped', email_error = 'No email address.'
   where n.email_status = 'pending'
     and not exists (select 1 from auth.users u where u.id = n.user_id and u.email is not null);

  return query
  with picked as (
    select n.id from public.notifications n
    where (n.email_status = 'pending'
           or (n.email_status = 'sending' and n.email_claimed_at < now() - interval '10 minutes'))
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  ), claimed as (
    update public.notifications n
       set email_status = 'sending', email_claimed_at = now(), email_attempts = n.email_attempts + 1
      from picked where n.id = picked.id
    returning n.id, n.user_id, n.kind, n.title, n.body, n.link_path, n.created_at
  )
  select c.id, u.email::text, p.full_name, c.kind, c.title, c.body, c.link_path, c.created_at
  from claimed c
  join public.profiles p on p.id = c.user_id
  join auth.users u on u.id = c.user_id
  order by c.created_at;
end;
$$;

-- Record a send: sent, or failed (retried up to five attempts).
create or replace function app.finish_email(p_notification_id uuid, p_sent boolean, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
     set email_status = case when p_sent then 'sent' when email_attempts >= 5 then 'failed' else 'pending' end,
         emailed_at = case when p_sent then now() end,
         email_error = case when p_sent then null else left(coalesce(p_error, 'Unknown error'), 500) end,
         email_claimed_at = null
   where id = p_notification_id and email_status = 'sending';
end;
$$;

revoke all on function public.set_email_notifications(boolean) from public;
revoke all on function app.claim_email_batch(int) from public;
revoke all on function app.finish_email(uuid, boolean, text) from public;
grant execute on function public.set_email_notifications(boolean) to authenticated;
grant execute on function app.claim_email_batch(int) to quickpro_mailer;
grant execute on function app.finish_email(uuid, boolean, text) to quickpro_mailer;
