-- Questions before the award (D-041).
--
-- While a request is open, the customer and each contractor that can see it
-- (it serves that service and town, or was invited) have a private thread:
-- the contractor asks about scope or access before quoting, and the customer
-- asks a contractor about its quote. Each contractor sees only its own
-- thread; other contractors never see the questions or the answers. Once the
-- request is awarded or cancelled the threads close (read-only), and the
-- winning contractor carries on in the project thread (D-026).
--
-- Nothing here deletes or drops anything. It adds a table and functions.

create table public.request_quote_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  -- Whose thread this is: the contractor talking with the customer.
  contractor_id uuid not null references public.organizations (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_org_id uuid references public.organizations (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index request_quote_messages_thread_idx on public.request_quote_messages (request_id, contractor_id, created_at);
create index request_quote_messages_author_idx on public.request_quote_messages (author_id, created_at desc);

alter table public.request_quote_messages enable row level security;

-- The customer, that one contractor, and staff. The text is read through quote_thread().
create policy "customer, the thread's contractor and staff see question rows"
  on public.request_quote_messages for select to authenticated
  using (
    app.is_admin()
    or app.is_org_member(contractor_id)
    or exists (select 1 from public.service_requests r where r.id = request_id and app.is_org_member(r.organization_id))
  );
grant select (id, request_id, contractor_id, author_id, author_org_id, created_at)
  on public.request_quote_messages to authenticated;

create trigger audit_request_quote_messages after insert or update or delete on public.request_quote_messages
  for each row execute function app.audit_row_change('request_quote_message', 'id', 'author_org_id');

-- Which side the signed-in person is on in a request's thread with a
-- contractor: 'customer', 'contractor', 'staff', or null for no access. A
-- contractor keeps its own thread after the request closes; before then it
-- needs to be able to see the request.
create or replace function app.quote_thread_side(p_request_id uuid, p_contractor_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.id is null then null
    when app.is_org_member(r.organization_id) then 'customer'
    when app.is_org_member(p_contractor_id)
         and (app.contractor_can_see_request(r.id, p_contractor_id)
              or exists (select 1 from public.request_quote_messages m
                         where m.request_id = r.id and m.contractor_id = p_contractor_id)) then 'contractor'
    when app.is_admin() then 'staff'
  end
  from (select 1) one
  left join public.service_requests r on r.id = p_request_id;
$$;

-- One contractor's thread with the customer, oldest first.
create or replace function public.quote_thread(p_request_id uuid, p_contractor_id uuid)
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
  if app.quote_thread_side(p_request_id, p_contractor_id) is null then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  select organization_id into v_customer from public.service_requests where service_requests.id = p_request_id;
  return query
  select m.id, m.author_id, coalesce(nullif(p.full_name, ''), 'Former member'),
         case when m.author_org_id = v_customer then 'customer'
              when m.author_org_id = p_contractor_id then 'contractor'
              else 'staff' end,
         o.name, m.body, m.created_at
  from public.request_quote_messages m
  left join public.profiles p on p.id = m.author_id
  left join public.organizations o on o.id = m.author_org_id
  where m.request_id = p_request_id and m.contractor_id = p_contractor_id
  order by m.created_at, m.id;
end;
$$;

-- The customer's (and staff's) list of threads on a request, latest first.
create or replace function public.request_quote_threads(p_request_id uuid)
returns table (
  contractor_id uuid,
  contractor_name text,
  message_count int,
  last_message_at timestamptz,
  awaiting_customer boolean,
  quote_status public.quote_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
begin
  select organization_id into v_customer from public.service_requests where id = p_request_id;
  if v_customer is null or not (app.is_org_member(v_customer) or app.is_admin()) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  return query
  select m.contractor_id, o.name, count(*)::int, max(m.created_at),
         -- The latest message came from the contractor.
         (array_agg(m.author_org_id order by m.created_at desc, m.id desc))[1] is distinct from v_customer,
         (select q.status from public.quotes q where q.request_id = p_request_id and q.contractor_id = m.contractor_id)
  from public.request_quote_messages m
  join public.organizations o on o.id = m.contractor_id
  where m.request_id = p_request_id
  group by m.contractor_id, o.name
  order by max(m.created_at) desc;
end;
$$;

-- Post to a thread. Owners, admins and dispatchers of the customer or of
-- that contractor, while the request is open and the contractor can see it.
create or replace function public.post_quote_message(p_request_id uuid, p_contractor_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.service_requests;
  v_side text := app.quote_thread_side(p_request_id, p_contractor_id);
  v_author_org uuid;
  v_target_org uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_title text;
  v_preview text;
  v_link text;
  v_user uuid;
begin
  select * into v_req from public.service_requests where id = p_request_id;
  if v_side is null then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_side = 'staff' then
    raise exception 'Only the customer and the contractor write in this thread.' using errcode = 'P0001';
  end if;
  v_author_org := case when v_side = 'customer' then v_req.organization_id else p_contractor_id end;
  v_target_org := case when v_side = 'customer' then p_contractor_id else v_req.organization_id end;
  if not app.can_dispatch(v_author_org) then
    raise exception 'Owners, admins and dispatchers on your team send questions.' using errcode = 'P0001';
  end if;
  if v_req.status <> 'open' then
    raise exception 'Questions close once the request is awarded or cancelled.' using errcode = 'P0001';
  end if;
  if not app.contractor_can_see_request(p_request_id, p_contractor_id) then
    raise exception 'That contractor can''t see this request. Invite them to quote first.' using errcode = 'P0001';
  end if;
  if v_body = '' then
    raise exception 'Write a message first.' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep messages under 2,000 characters.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.request_quote_messages
      where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'You''re sending messages too quickly. Wait a minute and try again.' using errcode = 'P0001';
  end if;

  insert into public.request_quote_messages (request_id, contractor_id, author_id, author_org_id, body)
  values (p_request_id, p_contractor_id, auth.uid(), v_author_org, v_body)
  returning id into v_id;

  v_title := case when v_side = 'customer'
    then 'Message from ' || (select name from public.organizations where id = v_req.organization_id) || ': ' || v_req.title
    else 'Question from ' || (select name from public.organizations where id = p_contractor_id) || ': ' || v_req.title end;
  v_preview := app.person_name(auth.uid()) || ': ' || left(v_body, 160);
  v_link := '/app/org/' || v_target_org || '/requests/' || v_req.id;
  for v_user in
    select user_id from public.organization_members
    where organization_id = v_target_org and role in ('owner', 'admin', 'dispatcher')
  loop
    -- One unread notification per thread, kept up to date.
    update public.notifications
       set title = left(v_title, 200), body = left(v_preview, 500), created_at = now()
     where user_id = v_user and link_path = v_link and kind = 'request.question' and read_at is null
       and title = left(v_title, 200);
    if not found then
      perform app.notify(v_user, 'request.question', v_title, v_preview, v_link, v_target_org, null);
    end if;
  end loop;
  return v_id;
end;
$$;

revoke all on function app.quote_thread_side(uuid, uuid) from public;
revoke all on function public.quote_thread(uuid, uuid) from public;
revoke all on function public.request_quote_threads(uuid) from public;
revoke all on function public.post_quote_message(uuid, uuid, text) from public;
grant execute on function app.quote_thread_side(uuid, uuid) to authenticated;
grant execute on function public.quote_thread(uuid, uuid) to authenticated;
grant execute on function public.request_quote_threads(uuid) to authenticated;
grant execute on function public.post_quote_message(uuid, uuid, text) to authenticated;
