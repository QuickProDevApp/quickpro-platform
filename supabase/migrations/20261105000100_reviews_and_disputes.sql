-- Reviews and disputes between the parties to finished work.
--
-- Three kinds of work relationship can be reviewed or disputed:
-- - project:     a customer and the contractor it awarded a request to
-- - subcontract: the prime contractor and its subcontractor
-- - shift:       a business and a worker it booked for a job (an assignment)
--
-- Reviews are two-way and double-blind: each side rates the other (1 to 5,
-- with an optional comment) within 14 days of the work being finished.
-- Neither side sees the other's review until both have written one or the
-- window closes, so nobody rates in reaction to the other. Published reviews
-- feed the averages shown in the contractor directories and on job
-- applicants. The reviewed party can reply once and flag a review for staff,
-- who can hide it with a reason (kept in the audit log).
--
-- Disputes: either side can raise a problem (quality, hours, no-show,
-- payment, conduct...) up to 90 days after the work. The two sides and staff
-- discuss it on the dispute's own thread; staff record the outcome. QuickPro
-- moves no money yet, so an outcome is a record, not a refund.
--
-- Additive: new types, tables, functions, and two directory functions
-- dropped and recreated with rating columns. No data is changed or removed.

create type public.work_context as enum ('project', 'subcontract', 'shift');

-- ---------------------------------------------------------------------------
-- Who is who on a piece of work
-- ---------------------------------------------------------------------------

-- The work behind a review or dispute: both parties, whether it is finished,
-- and a title. Internal; callers check the current user's side themselves.
create or replace function app.work_parties(p_context public.work_context, p_target uuid)
returns table (
  side_a text, org_a uuid, user_a uuid,
  side_b text, org_b uuid, user_b uuid,
  finished_at timestamptz,
  engaged boolean,
  request_id uuid,
  job_id uuid,
  title text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_context = 'project' then
    return query
    select 'customer', r.organization_id, null::uuid, 'contractor', q.contractor_id, null::uuid,
           case when r.status = 'completed' then r.completed_at end,
           r.status in ('awarded', 'completed'),
           r.id, null::uuid, r.title
    from public.service_requests r
    join public.quotes q on q.id = r.awarded_quote_id
    where r.id = p_target;
  elsif p_context = 'subcontract' then
    return query
    select 'prime', s.prime_id, null::uuid, 'subcontractor', s.sub_id, null::uuid,
           case when s.status = 'completed' then s.completed_at end,
           s.status in ('accepted', 'completed') or (s.status = 'cancelled' and s.responded_at is not null),
           s.request_id, null::uuid, r.title
    from public.subcontracts s
    join public.service_requests r on r.id = s.request_id
    where s.id = p_target;
  else
    return query
    select 'business', a.organization_id, null::uuid, 'worker', null::uuid, a.worker_user_id,
           case when a.status = 'completed' then a.completed_at end,
           a.status in ('accepted', 'completed') or (a.status = 'cancelled' and a.responded_at is not null),
           j.service_request_id, j.id, j.title
    from public.job_assignments a
    join public.jobs j on j.id = a.job_id
    where a.id = p_target;
  end if;
end;
$$;

-- The current user's side on a piece of work, or null. Organization sides
-- need a dispatcher role when p_act (writing reviews, opening disputes).
create or replace function app.my_side(p_context public.work_context, p_target uuid, p_act boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w record;
begin
  select * into w from app.work_parties(p_context, p_target);
  if w.side_a is null then
    return null;
  end if;
  if w.org_a is not null and (case when p_act then app.can_dispatch(w.org_a) else app.is_org_member(w.org_a) end) then
    return w.side_a;
  end if;
  if w.org_b is not null and (case when p_act then app.can_dispatch(w.org_b) else app.is_org_member(w.org_b) end) then
    return w.side_b;
  end if;
  if w.user_b is not null and w.user_b = auth.uid() then
    return w.side_b;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  context public.work_context not null,
  request_id uuid references public.service_requests (id) on delete cascade,
  subcontract_id uuid references public.subcontracts (id) on delete cascade,
  assignment_id uuid references public.job_assignments (id) on delete cascade,
  target_id uuid generated always as (coalesce(request_id, subcontract_id, assignment_id)) stored,
  author_side text not null check (author_side in ('customer', 'contractor', 'prime', 'subcontractor', 'business', 'worker')),
  author_id uuid references public.profiles (id) on delete set null,
  author_org_id uuid references public.organizations (id) on delete cascade,
  subject_org_id uuid references public.organizations (id) on delete cascade,
  subject_user_id uuid references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  -- Published once both sides have reviewed, or at this time.
  window_closes_at timestamptz not null,
  reply text check (reply is null or char_length(reply) between 1 and 1000),
  replied_at timestamptz,
  replied_by uuid references public.profiles (id) on delete set null,
  flagged_at timestamptz,
  flagged_by uuid references public.profiles (id) on delete set null,
  flag_reason text check (flag_reason is null or char_length(flag_reason) <= 500),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 500),
  created_at timestamptz not null default now(),
  check (num_nonnulls(request_id, subcontract_id, assignment_id) = 1),
  check (num_nonnulls(subject_org_id, subject_user_id) = 1),
  unique (target_id, author_side)
);

create index reviews_subject_org_idx on public.reviews (subject_org_id, created_at desc);
create index reviews_subject_user_idx on public.reviews (subject_user_id, created_at desc);
create index reviews_author_org_idx on public.reviews (author_org_id, created_at desc);
create index reviews_author_idx on public.reviews (author_id, created_at desc);
create index reviews_flagged_idx on public.reviews (flagged_at) where flagged_at is not null and hidden_at is null;

-- Visible to the other side once both have reviewed or the window closed.
create or replace function app.review_published(p_review public.reviews)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_review.window_closes_at <= now()
      or exists (select 1 from public.reviews o where o.target_id = p_review.target_id and o.author_side <> p_review.author_side);
$$;

create or replace function app.is_review_subject(p_review public.reviews)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_review.subject_org_id is not null and app.is_org_member(p_review.subject_org_id))
      or (p_review.subject_user_id is not null and p_review.subject_user_id = auth.uid());
$$;

create or replace function app.is_review_author(p_review public.reviews)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_review.author_id = auth.uid()
      or (p_review.author_org_id is not null and app.is_org_member(p_review.author_org_id));
$$;

alter table public.reviews enable row level security;

-- Authors see what they wrote; the reviewed party once it's published; staff everything.
create policy "authors, published subjects and staff read reviews"
  on public.reviews for select to authenticated
  using (app.is_admin() or app.is_review_author(reviews) or (app.is_review_subject(reviews) and app.review_published(reviews)));
grant select on public.reviews to authenticated;

create trigger audit_reviews after insert or update or delete on public.reviews
  for each row execute function app.audit_row_change('review', 'id', 'subject_org_id');

-- Average and count of published, visible reviews about an organization or a worker.
create or replace function app.rating_of(p_org_id uuid, p_user_id uuid)
returns table (rating_avg numeric, rating_count int)
language sql
stable
security definer
set search_path = ''
as $$
  select round(avg(r.rating)::numeric, 1), count(*)::int
  from public.reviews r
  where r.hidden_at is null and app.review_published(r)
    and ((p_org_id is not null and r.subject_org_id = p_org_id) or (p_user_id is not null and r.subject_user_id = p_user_id));
$$;

create or replace function public.submit_review(p_context public.work_context, p_target uuid, p_rating int, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  v_side text := app.my_side(p_context, p_target, true);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_subject_org uuid;
  v_subject_user uuid;
  v_author_org uuid;
  v_name text;
  v_link text;
begin
  select * into w from app.work_parties(p_context, p_target);
  if v_side is null then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  if w.finished_at is null then
    raise exception 'Reviews open once the work is finished.' using errcode = 'P0001';
  end if;
  if w.finished_at < now() - interval '14 days' then
    raise exception 'The 14 days for reviewing this work have passed.' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Choose a rating from 1 to 5 stars.' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep the review under 2,000 characters.' using errcode = 'P0001';
  end if;
  if p_rating <= 2 and char_length(v_body) < 10 then
    raise exception 'Say briefly what went wrong so the rating is useful.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reviews where target_id = p_target and author_side = v_side) then
    raise exception 'Your side already reviewed this work.' using errcode = 'P0001';
  end if;

  if v_side = w.side_a then
    v_author_org := w.org_a; v_subject_org := w.org_b; v_subject_user := w.user_b;
  else
    v_author_org := w.org_b; v_subject_org := w.org_a; v_subject_user := w.user_a;
  end if;

  insert into public.reviews (context, request_id, subcontract_id, assignment_id, author_side, author_id, author_org_id,
                              subject_org_id, subject_user_id, rating, body, window_closes_at)
  values (p_context,
          case when p_context = 'project' then p_target end,
          case when p_context = 'subcontract' then p_target end,
          case when p_context = 'shift' then p_target end,
          v_side, auth.uid(), v_author_org, v_subject_org, v_subject_user, p_rating, v_body,
          w.finished_at + interval '14 days')
  returning id into v_id;

  v_name := coalesce((select name from public.organizations where id = v_author_org), app.person_name(auth.uid()), 'The other side');
  if v_subject_org is not null then
    v_link := '/app/org/' || v_subject_org || '/reviews';
    perform app.notify_dispatchers(v_subject_org, 'review.received', v_name || ' reviewed your work',
      w.title || '. You''ll see the review when you''ve reviewed them too, or when the review window closes.', v_link, null);
  else
    perform app.notify(v_subject_user, 'review.received', v_name || ' reviewed your work',
      w.title || '. You''ll see the review when you''ve reviewed them too, or when the review window closes.',
      '/app/worker/reviews', null, null);
  end if;
  return v_id;
end;
$$;

-- What the current user can do about reviews on one piece of work, and the reviews they may see on it.
create or replace function public.work_reviews(p_context public.work_context, p_target uuid)
returns table (
  my_side text,
  other_name text,
  can_review boolean,
  window_closes_at timestamptz,
  review_id uuid,
  author_side text,
  mine boolean,
  rating smallint,
  body text,
  reply text,
  published boolean,
  hidden boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w record;
  v_side text := app.my_side(p_context, p_target, false);
  v_act boolean := app.my_side(p_context, p_target, true) is not null;
  v_other text;
  v_can boolean;
begin
  select * into w from app.work_parties(p_context, p_target);
  if w.side_a is null or (v_side is null and not app.is_admin()) then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  v_other := case when v_side = w.side_a then
               coalesce((select name from public.organizations where id = w.org_b), app.person_name(w.user_b))
             else (select name from public.organizations where id = w.org_a) end;
  v_can := v_act and w.finished_at is not null and w.finished_at >= now() - interval '14 days'
           and not exists (select 1 from public.reviews x where x.target_id = p_target and x.author_side = v_side);
  return query
  select v_side, v_other, v_can, w.finished_at + interval '14 days',
         r.id, r.author_side, r.author_side = v_side, r.rating,
         case when r.hidden_at is null or r.author_side = v_side or app.is_admin() then r.body else '' end,
         r.reply, app.review_published(r), r.hidden_at is not null, r.created_at
  from (select 1) one
  left join public.reviews r
    on r.target_id = p_target
   and (app.is_admin() or r.author_side = v_side or app.review_published(r))
  order by r.created_at nulls first;
end;
$$;

-- Reviews about a business (for its members and staff), with who wrote them and on what.
create or replace function public.org_reviews(p_org_id uuid)
returns table (
  id uuid,
  context public.work_context,
  target_id uuid,
  request_id uuid,
  title text,
  author_side text,
  author_name text,
  rating smallint,
  body text,
  reply text,
  replied_at timestamptz,
  flagged boolean,
  hidden boolean,
  hidden_reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.is_org_member(p_org_id) or app.is_admin()) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  return query
  select r.id, r.context, r.target_id, w.request_id, w.title, r.author_side,
         coalesce((select name from public.organizations where organizations.id = r.author_org_id), app.person_name(r.author_id), 'Former member'),
         r.rating, r.body, r.reply, r.replied_at, r.flagged_at is not null, r.hidden_at is not null, r.hidden_reason, r.created_at
  from public.reviews r
  cross join lateral app.work_parties(r.context, r.target_id) w
  where r.subject_org_id = p_org_id and app.review_published(r)
  order by r.created_at desc
  limit 200;
end;
$$;

-- Reviews about the signed-in worker.
create or replace function public.my_worker_reviews()
returns table (
  id uuid,
  title text,
  author_name text,
  rating smallint,
  body text,
  reply text,
  replied_at timestamptz,
  flagged boolean,
  hidden boolean,
  hidden_reason text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, w.title, coalesce((select name from public.organizations where organizations.id = r.author_org_id), 'A business'),
         r.rating, r.body, r.reply, r.replied_at, r.flagged_at is not null, r.hidden_at is not null, r.hidden_reason, r.created_at
  from public.reviews r
  cross join lateral app.work_parties(r.context, r.target_id) w
  where r.subject_user_id = auth.uid() and app.review_published(r)
  order by r.created_at desc
  limit 200;
$$;

-- The rating summary for a business or the signed-in worker's own profile.
create or replace function public.org_rating(p_org_id uuid)
returns table (rating_avg numeric, rating_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.is_org_member(p_org_id) or app.is_admin()) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  return query select * from app.rating_of(p_org_id, null);
end;
$$;

create or replace function public.my_worker_rating()
returns table (rating_avg numeric, rating_count int)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.rating_of(null, auth.uid());
$$;

-- The reviewed party answers a published review once, publicly.
create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.reviews;
  v_reply text := btrim(coalesce(p_reply, ''));
begin
  select * into v_r from public.reviews where id = p_review_id for update;
  if v_r.id is null or not app.review_published(v_r) or not (
    (v_r.subject_org_id is not null and app.can_dispatch(v_r.subject_org_id))
    or (v_r.subject_user_id is not null and v_r.subject_user_id = auth.uid())
  ) then
    raise exception 'Review not found.' using errcode = 'P0002';
  end if;
  if v_r.reply is not null then
    raise exception 'You already replied to this review.' using errcode = 'P0001';
  end if;
  if v_reply = '' then
    raise exception 'Write a reply first.' using errcode = 'P0001';
  end if;
  if char_length(v_reply) > 1000 then
    raise exception 'Keep the reply under 1,000 characters.' using errcode = 'P0001';
  end if;
  update public.reviews set reply = v_reply, replied_at = now(), replied_by = auth.uid() where id = p_review_id;
end;
$$;

-- The reviewed party asks staff to look at a review (abuse, private details, the wrong job).
create or replace function public.flag_review(p_review_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.reviews;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_staff uuid;
begin
  select * into v_r from public.reviews where id = p_review_id for update;
  if v_r.id is null or not app.review_published(v_r) or not app.is_review_subject(v_r) then
    raise exception 'Review not found.' using errcode = 'P0002';
  end if;
  if v_r.flagged_at is not null then
    raise exception 'This review is already with QuickPro staff.' using errcode = 'P0001';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Tell staff what''s wrong with this review.' using errcode = 'P0001';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = 'P0001';
  end if;
  update public.reviews set flagged_at = now(), flagged_by = auth.uid(), flag_reason = v_reason where id = p_review_id;
  for v_staff in select id from public.profiles where platform_role = 'admin' loop
    perform app.notify(v_staff, 'review.flagged', 'A review was flagged', left(v_reason, 300), '/app/admin/reviews', null, null);
  end loop;
end;
$$;

-- Staff hide a review (it stops counting toward ratings) or clear a flag.
create or replace function public.moderate_review(p_review_id uuid, p_hide boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.reviews;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not app.is_admin() then
    raise exception 'Review not found.' using errcode = 'P0002';
  end if;
  select * into v_r from public.reviews where id = p_review_id for update;
  if v_r.id is null then
    raise exception 'Review not found.' using errcode = 'P0002';
  end if;
  if p_hide then
    if v_reason = '' then
      raise exception 'Add the reason for hiding this review. Both sides see it.' using errcode = 'P0001';
    end if;
    update public.reviews set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = left(v_reason, 500) where id = p_review_id;
  else
    -- Keep the review: clear the flag (or un-hide it).
    update public.reviews set flagged_at = null, flag_reason = null, flagged_by = null,
                              hidden_at = null, hidden_by = null, hidden_reason = null
     where id = p_review_id;
  end if;
end;
$$;

-- Flagged and hidden reviews for staff.
create or replace function public.admin_reviews(p_filter text)
returns table (
  id uuid,
  context public.work_context,
  title text,
  request_id uuid,
  job_id uuid,
  author_name text,
  subject_name text,
  subject_org_id uuid,
  subject_user_id uuid,
  rating smallint,
  body text,
  reply text,
  flag_reason text,
  flagged_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text,
  published boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  return query
  select r.id, r.context, w.title, w.request_id, w.job_id,
         coalesce((select name from public.organizations where organizations.id = r.author_org_id), app.person_name(r.author_id), 'Former member'),
         coalesce((select name from public.organizations where organizations.id = r.subject_org_id), app.person_name(r.subject_user_id), 'Former member'),
         r.subject_org_id, r.subject_user_id, r.rating, r.body, r.reply, r.flag_reason, r.flagged_at, r.hidden_at, r.hidden_reason,
         app.review_published(r), r.created_at
  from public.reviews r
  cross join lateral app.work_parties(r.context, r.target_id) w
  where case p_filter
          when 'flagged' then r.flagged_at is not null and r.hidden_at is null
          when 'hidden' then r.hidden_at is not null
          when 'low' then r.rating <= 2
          else true end
  order by coalesce(r.flagged_at, r.created_at) desc
  limit 200;
end;
$$;

-- Ratings for the workers who applied to or were booked on a job, for its dispatchers.
create or replace function public.job_worker_ratings(p_job_id uuid)
returns table (worker_user_id uuid, rating_avg numeric, rating_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.jobs where id = p_job_id;
  if v_org is null or not (app.can_dispatch(v_org) or app.is_admin()) then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;
  return query
  select u.user_id, r.rating_avg, r.rating_count
  from (select ja.worker_user_id as user_id from public.job_applications ja where ja.job_id = p_job_id
        union select js.worker_user_id from public.job_assignments js where js.job_id = p_job_id) u
  cross join lateral app.rating_of(null, u.user_id) r;
end;
$$;

-- The customer's rating from contractors, for contractors who can see its request.
create or replace function public.request_customer_rating(p_request_id uuid)
returns table (rating_avg numeric, rating_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer uuid;
begin
  select organization_id into v_customer from public.service_requests where id = p_request_id;
  if v_customer is null or not app.can_see_request(p_request_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  return query select * from app.rating_of(v_customer, null);
end;
$$;

-- Directories now carry each contractor's rating.
drop function public.contractor_directory(uuid, uuid, uuid);
create function public.contractor_directory(p_customer_id uuid, p_category_id uuid, p_area_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  years_in_business int,
  crew_size int,
  website text,
  category_names text[],
  area_names text[],
  serves_category boolean,
  serves_area boolean,
  insurance_reviewed boolean,
  rating_avg numeric,
  rating_count int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_market uuid;
begin
  select market_id into v_market from public.organizations
   where organizations.id = p_customer_id and kind = 'customer' and status = 'approved';
  if v_market is null or not (app.is_org_member(p_customer_id) or app.is_admin()) then
    raise exception 'Your organization must be approved by QuickPro staff before it can browse contractors.' using errcode = 'P0001';
  end if;
  return query
  select o.id, o.name, o.description, o.years_in_business, o.crew_size, o.website,
         coalesce((select array_agg(c.name order by c.sort_order) from public.contractor_services s
                   join public.service_categories c on c.id = s.category_id where s.organization_id = o.id), '{}'),
         coalesce((select array_agg(a.name order by a.name) from public.contractor_service_areas sa
                   join public.service_areas a on a.id = sa.service_area_id where sa.organization_id = o.id), '{}'),
         p_category_id is not null and exists (select 1 from public.contractor_services s where s.organization_id = o.id and s.category_id = p_category_id),
         p_area_id is not null and exists (select 1 from public.contractor_service_areas sa where sa.organization_id = o.id and sa.service_area_id = p_area_id),
         app.org_has_reviewed_insurance(o.id),
         rt.rating_avg, rt.rating_count
  from public.organizations o
  cross join lateral app.rating_of(o.id, null) rt
  where o.kind = 'contractor' and o.status = 'approved' and o.market_id = v_market
    and (p_category_id is null or exists (select 1 from public.contractor_services s where s.organization_id = o.id and s.category_id = p_category_id))
    and (p_area_id is null or exists (select 1 from public.contractor_service_areas sa where sa.organization_id = o.id and sa.service_area_id = p_area_id))
  order by o.name;
end;
$$;

drop function public.subcontractor_directory(uuid, uuid);
create function public.subcontractor_directory(p_prime_id uuid, p_category_id uuid)
returns table (
  id uuid,
  name text,
  years_in_business int,
  crew_size int,
  category_names text[],
  area_names text[],
  serves_category boolean,
  rating_avg numeric,
  rating_count int
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
         p_category_id is not null and exists (select 1 from public.contractor_services s where s.organization_id = o.id and s.category_id = p_category_id),
         rt.rating_avg, rt.rating_count
  from public.organizations o
  cross join lateral app.rating_of(o.id, null) rt
  where o.kind = 'contractor' and o.status = 'approved' and o.market_id = v_market and o.id <> p_prime_id
    and app.org_has_reviewed_insurance(o.id)
  order by 7 desc, o.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------
create type public.dispute_status as enum ('open', 'resolved', 'withdrawn');
create type public.dispute_reason as enum ('quality', 'incomplete', 'no_show', 'hours', 'payment', 'damage', 'conduct', 'other');
create type public.dispute_outcome as enum ('resolved_by_parties', 'upheld', 'partly_upheld', 'not_upheld');

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  context public.work_context not null,
  request_id uuid references public.service_requests (id) on delete cascade,
  subcontract_id uuid references public.subcontracts (id) on delete cascade,
  assignment_id uuid references public.job_assignments (id) on delete cascade,
  target_id uuid generated always as (coalesce(request_id, subcontract_id, assignment_id)) stored,
  opener_side text not null check (opener_side in ('customer', 'contractor', 'prime', 'subcontractor', 'business', 'worker')),
  opened_by uuid references public.profiles (id) on delete set null,
  opener_org_id uuid references public.organizations (id) on delete cascade,
  opener_user_id uuid references public.profiles (id) on delete cascade,
  respondent_side text not null check (respondent_side in ('customer', 'contractor', 'prime', 'subcontractor', 'business', 'worker')),
  respondent_org_id uuid references public.organizations (id) on delete cascade,
  respondent_user_id uuid references public.profiles (id) on delete cascade,
  reason public.dispute_reason not null,
  summary text not null check (char_length(summary) between 20 and 2000),
  desired_outcome text not null default '' check (char_length(desired_outcome) <= 1000),
  status public.dispute_status not null default 'open',
  outcome public.dispute_outcome,
  resolution text check (resolution is null or char_length(resolution) <= 2000),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  withdrawn_at timestamptz,
  withdraw_note text check (withdraw_note is null or char_length(withdraw_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(request_id, subcontract_id, assignment_id) = 1),
  check (num_nonnulls(opener_org_id, opener_user_id) = 1),
  check (num_nonnulls(respondent_org_id, respondent_user_id) = 1),
  check (status <> 'resolved' or (outcome is not null and resolution is not null))
);

create index disputes_opener_org_idx on public.disputes (opener_org_id, created_at desc);
create index disputes_respondent_org_idx on public.disputes (respondent_org_id, created_at desc);
create index disputes_opener_user_idx on public.disputes (opener_user_id, created_at desc);
create index disputes_respondent_user_idx on public.disputes (respondent_user_id, created_at desc);
create index disputes_open_idx on public.disputes (created_at) where status = 'open';
-- One open dispute per side per piece of work.
create unique index disputes_one_open_idx on public.disputes (target_id, opener_side) where status = 'open';

create trigger disputes_touch before update on public.disputes
  for each row execute function app.touch_updated_at();

-- The current user is on one of the dispute's two sides.
create or replace function app.dispute_side(p_dispute public.disputes)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (p_dispute.opener_org_id is not null and app.is_org_member(p_dispute.opener_org_id))
         or p_dispute.opener_user_id = auth.uid() then 'opener'
    when (p_dispute.respondent_org_id is not null and app.is_org_member(p_dispute.respondent_org_id))
         or p_dispute.respondent_user_id = auth.uid() then 'respondent'
  end;
$$;

alter table public.disputes enable row level security;
create policy "the two sides and staff read disputes"
  on public.disputes for select to authenticated
  using (app.is_admin() or app.dispute_side(disputes) is not null);
grant select on public.disputes to authenticated;

create trigger audit_disputes after insert or update or delete on public.disputes
  for each row execute function app.audit_row_change('dispute', 'id', 'respondent_org_id');

create table public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_side text not null check (author_side in ('opener', 'respondent', 'staff')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index dispute_messages_dispute_idx on public.dispute_messages (dispute_id, created_at);
create index dispute_messages_author_idx on public.dispute_messages (author_id, created_at desc);

alter table public.dispute_messages enable row level security;
create policy "the two sides and staff read dispute messages"
  on public.dispute_messages for select to authenticated
  using (exists (select 1 from public.disputes d where d.id = dispute_id and (app.is_admin() or app.dispute_side(d) is not null)));
grant select on public.dispute_messages to authenticated;

create trigger audit_dispute_messages after insert or update or delete on public.dispute_messages
  for each row execute function app.audit_row_change('dispute_message', 'id', '');

-- Where each party opens a dispute in the app.
create or replace function app.dispute_link(p_dispute_id uuid, p_org_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_org_id is null then '/app/worker/disputes/' || p_dispute_id
              else '/app/org/' || p_org_id || '/disputes/' || p_dispute_id end;
$$;

-- Tell one side of a dispute (its dispatchers, or the worker).
create or replace function app.notify_dispute_side(p_org_id uuid, p_user_id uuid, p_dispute_id uuid, p_kind text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_org_id is not null then
    perform app.notify_dispatchers(p_org_id, p_kind, p_title, p_body, app.dispute_link(p_dispute_id, p_org_id), null);
  else
    perform app.notify(p_user_id, p_kind, p_title, p_body, app.dispute_link(p_dispute_id, null), null, null);
  end if;
end;
$$;

create or replace function app.notify_staff(p_kind text, p_title text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid;
begin
  for v_staff in select id from public.profiles where platform_role = 'admin' loop
    perform app.notify(v_staff, p_kind, p_title, p_body, p_link, null, null);
  end loop;
end;
$$;

create or replace function public.open_dispute(
  p_context public.work_context, p_target uuid, p_reason public.dispute_reason, p_summary text, p_desired_outcome text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  v_side text := app.my_side(p_context, p_target, true);
  v_summary text := btrim(coalesce(p_summary, ''));
  v_desired text := btrim(coalesce(p_desired_outcome, ''));
  v_id uuid;
  v_opener_org uuid;
  v_opener_user uuid;
  v_resp_org uuid;
  v_resp_user uuid;
  v_resp_side text;
  v_name text;
begin
  select * into w from app.work_parties(p_context, p_target);
  if v_side is null then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  if not w.engaged then
    raise exception 'A dispute can be raised only about work that was agreed.' using errcode = 'P0001';
  end if;
  if w.finished_at is not null and w.finished_at < now() - interval '90 days' then
    raise exception 'Disputes can be raised up to 90 days after the work. Contact QuickPro support for older work.' using errcode = 'P0001';
  end if;
  if p_reason is null then
    raise exception 'Choose what the problem is about.' using errcode = 'P0001';
  end if;
  if char_length(v_summary) < 20 then
    raise exception 'Describe what happened in a few sentences (at least 20 characters).' using errcode = 'P0001';
  end if;
  if char_length(v_summary) > 2000 then
    raise exception 'Keep the description under 2,000 characters.' using errcode = 'P0001';
  end if;
  if char_length(v_desired) > 1000 then
    raise exception 'Keep the outcome you''re asking for under 1,000 characters.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.disputes where target_id = p_target and opener_side = v_side and status = 'open') then
    raise exception 'You already have an open dispute about this work. Add to it instead.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.disputes where opened_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve opened several disputes today. Contact QuickPro support if you need more.' using errcode = 'P0001';
  end if;

  if v_side = w.side_a then
    v_opener_org := w.org_a; v_opener_user := w.user_a;
    v_resp_side := w.side_b; v_resp_org := w.org_b; v_resp_user := w.user_b;
  else
    v_opener_org := w.org_b; v_opener_user := w.user_b;
    v_resp_side := w.side_a; v_resp_org := w.org_a; v_resp_user := w.user_a;
  end if;

  insert into public.disputes (context, request_id, subcontract_id, assignment_id, opener_side, opened_by, opener_org_id, opener_user_id,
                               respondent_side, respondent_org_id, respondent_user_id, reason, summary, desired_outcome)
  values (p_context,
          case when p_context = 'project' then p_target end,
          case when p_context = 'subcontract' then p_target end,
          case when p_context = 'shift' then p_target end,
          v_side, auth.uid(), v_opener_org, v_opener_user, v_resp_side, v_resp_org, v_resp_user,
          p_reason, v_summary, v_desired)
  returning id into v_id;

  v_name := coalesce((select name from public.organizations where id = v_opener_org), app.person_name(auth.uid()), 'The other side');
  perform app.notify_dispute_side(v_resp_org, v_resp_user, v_id, 'dispute.opened', v_name || ' raised a dispute',
    w.title || ': ' || left(v_summary, 300));
  perform app.notify_staff('dispute.opened', 'New dispute: ' || w.title, v_name || ': ' || left(v_summary, 300), '/app/admin/disputes/' || v_id);
  if p_context = 'project' then
    perform app.log_request_event(p_target, 'dispute.opened', 'Dispute raised by ' || v_name, '', null);
  end if;
  return v_id;
end;
$$;

create or replace function public.post_dispute_message(p_dispute_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.disputes;
  v_side text;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_preview text;
  v_title text;
begin
  select * into v_d from public.disputes where id = p_dispute_id;
  if v_d.id is null then
    raise exception 'Dispute not found.' using errcode = 'P0002';
  end if;
  v_side := app.dispute_side(v_d);
  if v_side is null and app.is_admin() then
    v_side := 'staff';
  end if;
  -- Organization sides post as dispatchers; workers post for themselves.
  if v_side = 'opener' and v_d.opener_org_id is not null and not app.can_dispatch(v_d.opener_org_id)
     or v_side = 'respondent' and v_d.respondent_org_id is not null and not app.can_dispatch(v_d.respondent_org_id) then
    raise exception 'Owners, admins and dispatchers on your team can reply on disputes.' using errcode = 'P0001';
  end if;
  if v_side is null then
    raise exception 'Dispute not found.' using errcode = 'P0002';
  end if;
  if v_d.status <> 'open' then
    raise exception 'This dispute is closed.' using errcode = 'P0001';
  end if;
  if v_body = '' then
    raise exception 'Write a message first.' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Keep messages under 2,000 characters.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dispute_messages where author_id = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'You''re sending messages too quickly. Wait a minute and try again.' using errcode = 'P0001';
  end if;

  insert into public.dispute_messages (dispute_id, author_id, author_side, body)
  values (p_dispute_id, auth.uid(), v_side, v_body)
  returning id into v_id;

  select title into v_title from app.work_parties(v_d.context, v_d.target_id);
  v_preview := case when v_side = 'staff' then 'QuickPro staff' else app.person_name(auth.uid()) end || ': ' || left(v_body, 200);
  if v_side <> 'opener' then
    perform app.notify_dispute_side(v_d.opener_org_id, v_d.opener_user_id, v_d.id, 'dispute.message', 'Dispute update: ' || v_title, v_preview);
  end if;
  if v_side <> 'respondent' then
    perform app.notify_dispute_side(v_d.respondent_org_id, v_d.respondent_user_id, v_d.id, 'dispute.message', 'Dispute update: ' || v_title, v_preview);
  end if;
  if v_side <> 'staff' then
    perform app.notify_staff('dispute.message', 'Dispute update: ' || v_title, v_preview, '/app/admin/disputes/' || v_d.id);
  end if;
  return v_id;
end;
$$;

create or replace function public.withdraw_dispute(p_dispute_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.disputes;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_title text;
begin
  select * into v_d from public.disputes where id = p_dispute_id for update;
  if v_d.id is null or not (
    (v_d.opener_org_id is not null and app.can_dispatch(v_d.opener_org_id)) or v_d.opener_user_id = auth.uid()
  ) then
    raise exception 'Dispute not found.' using errcode = 'P0002';
  end if;
  if v_d.status <> 'open' then
    raise exception 'This dispute is already %.', v_d.status using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = 'P0001';
  end if;
  update public.disputes set status = 'withdrawn', withdrawn_at = now(), withdraw_note = v_note where id = p_dispute_id;
  select title into v_title from app.work_parties(v_d.context, v_d.target_id);
  perform app.notify_dispute_side(v_d.respondent_org_id, v_d.respondent_user_id, v_d.id, 'dispute.withdrawn',
    'Dispute withdrawn: ' || v_title, coalesce(v_note, ''));
  perform app.notify_staff('dispute.withdrawn', 'Dispute withdrawn: ' || v_title, coalesce(v_note, ''), '/app/admin/disputes/' || v_d.id);
  if v_d.context = 'project' then
    perform app.log_request_event(v_d.target_id, 'dispute.withdrawn', 'Dispute withdrawn', coalesce(v_note, ''), null);
  end if;
end;
$$;

-- Staff record how a dispute ended. Money is not moved by QuickPro yet.
create or replace function public.resolve_dispute(p_dispute_id uuid, p_outcome public.dispute_outcome, p_resolution text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.disputes;
  v_text text := btrim(coalesce(p_resolution, ''));
  v_title text;
  v_label text;
begin
  if not app.is_admin() then
    raise exception 'Dispute not found.' using errcode = 'P0002';
  end if;
  select * into v_d from public.disputes where id = p_dispute_id for update;
  if v_d.id is null then
    raise exception 'Dispute not found.' using errcode = 'P0002';
  end if;
  if v_d.status <> 'open' then
    raise exception 'This dispute is already %.', v_d.status using errcode = 'P0001';
  end if;
  if p_outcome is null then
    raise exception 'Choose an outcome.' using errcode = 'P0001';
  end if;
  if char_length(v_text) < 10 then
    raise exception 'Explain the decision to both sides (at least 10 characters).' using errcode = 'P0001';
  end if;
  if char_length(v_text) > 2000 then
    raise exception 'Keep the resolution under 2,000 characters.' using errcode = 'P0001';
  end if;
  update public.disputes
     set status = 'resolved', outcome = p_outcome, resolution = v_text, resolved_by = auth.uid(), resolved_at = now()
   where id = p_dispute_id;
  select title into v_title from app.work_parties(v_d.context, v_d.target_id);
  v_label := case p_outcome
               when 'resolved_by_parties' then 'Resolved between the parties'
               when 'upheld' then 'Upheld'
               when 'partly_upheld' then 'Partly upheld'
               else 'Not upheld' end;
  perform app.notify_dispute_side(v_d.opener_org_id, v_d.opener_user_id, v_d.id, 'dispute.resolved',
    'Dispute closed: ' || v_title, v_label || '. ' || left(v_text, 300));
  perform app.notify_dispute_side(v_d.respondent_org_id, v_d.respondent_user_id, v_d.id, 'dispute.resolved',
    'Dispute closed: ' || v_title, v_label || '. ' || left(v_text, 300));
  if v_d.context = 'project' then
    perform app.log_request_event(v_d.target_id, 'dispute.resolved', 'Dispute closed by QuickPro staff: ' || v_label, v_text, null);
  end if;
end;
$$;

-- Disputes with party names and what they're about, for a business, the signed-in worker, or staff.
create or replace function app.dispute_rows(p_org_id uuid, p_user_id uuid, p_all boolean, p_status public.dispute_status)
returns table (
  id uuid,
  context public.work_context,
  target_id uuid,
  request_id uuid,
  job_id uuid,
  title text,
  opener_side text,
  opener_name text,
  opener_org_id uuid,
  respondent_side text,
  respondent_name text,
  respondent_org_id uuid,
  reason public.dispute_reason,
  summary text,
  desired_outcome text,
  status public.dispute_status,
  outcome public.dispute_outcome,
  resolution text,
  resolved_at timestamptz,
  withdrawn_at timestamptz,
  withdraw_note text,
  message_count int,
  last_activity_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.context, d.target_id, w.request_id, w.job_id, w.title,
         d.opener_side, coalesce((select name from public.organizations where organizations.id = d.opener_org_id), app.person_name(d.opener_user_id), 'Former member'),
         d.opener_org_id,
         d.respondent_side, coalesce((select name from public.organizations where organizations.id = d.respondent_org_id), app.person_name(d.respondent_user_id), 'Former member'),
         d.respondent_org_id,
         d.reason, d.summary, d.desired_outcome, d.status, d.outcome, d.resolution, d.resolved_at, d.withdrawn_at, d.withdraw_note,
         (select count(*)::int from public.dispute_messages m where m.dispute_id = d.id),
         greatest(d.updated_at, coalesce((select max(m.created_at) from public.dispute_messages m where m.dispute_id = d.id), d.updated_at)),
         d.created_at
  from public.disputes d
  cross join lateral app.work_parties(d.context, d.target_id) w
  where (p_all
         or (p_org_id is not null and (d.opener_org_id = p_org_id or d.respondent_org_id = p_org_id))
         or (p_user_id is not null and (d.opener_user_id = p_user_id or d.respondent_user_id = p_user_id)))
    and (p_status is null or d.status = p_status)
  order by case when d.status = 'open' then 0 else 1 end, d.created_at desc
  limit 200;
$$;

create or replace function public.list_disputes(p_org_id uuid, p_status public.dispute_status)
returns table (
  id uuid, context public.work_context, target_id uuid, request_id uuid, job_id uuid, title text,
  opener_side text, opener_name text, opener_org_id uuid, respondent_side text, respondent_name text, respondent_org_id uuid,
  reason public.dispute_reason, summary text, desired_outcome text, status public.dispute_status, outcome public.dispute_outcome,
  resolution text, resolved_at timestamptz, withdrawn_at timestamptz, withdraw_note text, message_count int,
  last_activity_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_org_id is null then
    -- The signed-in worker's own disputes. Staff use admin_disputes.
    return query select * from app.dispute_rows(null, auth.uid(), false, p_status);
    return;
  end if;
  if not (app.is_org_member(p_org_id) or app.is_admin()) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  return query select * from app.dispute_rows(p_org_id, null, false, p_status);
end;
$$;

-- Every dispute, for QuickPro staff.
create or replace function public.admin_disputes(p_status public.dispute_status)
returns table (
  id uuid, context public.work_context, target_id uuid, request_id uuid, job_id uuid, title text,
  opener_side text, opener_name text, opener_org_id uuid, respondent_side text, respondent_name text, respondent_org_id uuid,
  reason public.dispute_reason, summary text, desired_outcome text, status public.dispute_status, outcome public.dispute_outcome,
  resolution text, resolved_at timestamptz, withdrawn_at timestamptz, withdraw_note text, message_count int,
  last_activity_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  return query select * from app.dispute_rows(null, null, true, p_status);
end;
$$;

-- One dispute for one of its sides or staff, with the viewer's side.
create or replace function public.get_dispute(p_dispute_id uuid)
returns table (
  id uuid, context public.work_context, target_id uuid, request_id uuid, job_id uuid, title text,
  opener_side text, opener_name text, opener_org_id uuid, respondent_side text, respondent_name text, respondent_org_id uuid,
  reason public.dispute_reason, summary text, desired_outcome text, status public.dispute_status, outcome public.dispute_outcome,
  resolution text, resolved_at timestamptz, withdrawn_at timestamptz, withdraw_note text, message_count int,
  last_activity_at timestamptz, created_at timestamptz,
  viewer_side text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_d public.disputes;
  v_side text;
begin
  select * into v_d from public.disputes where disputes.id = p_dispute_id;
  if v_d.id is null then
    raise exception 'Dispute not found.' using errcode = 'P0002';
  end if;
  v_side := coalesce(app.dispute_side(v_d), case when app.is_admin() then 'staff' end);
  if v_side is null then
    raise exception 'Dispute not found.' using errcode = 'P0002';
  end if;
  return query
  select r.*, v_side
  from app.dispute_rows(v_d.opener_org_id, v_d.opener_user_id, false, null) r
  where r.id = p_dispute_id;
end;
$$;

create or replace function public.dispute_thread(p_dispute_id uuid)
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
  v_d public.disputes;
begin
  select * into v_d from public.disputes where disputes.id = p_dispute_id;
  if v_d.id is null or not (app.is_admin() or app.dispute_side(v_d) is not null) then
    raise exception 'Dispute not found.' using errcode = 'P0002';
  end if;
  return query
  select m.id, m.author_id,
         case when m.author_side = 'staff' then 'QuickPro staff' else coalesce(nullif(p.full_name, ''), 'Former member') end,
         m.author_side,
         case m.author_side
           when 'opener' then coalesce((select name from public.organizations where organizations.id = v_d.opener_org_id), 'Worker')
           when 'respondent' then coalesce((select name from public.organizations where organizations.id = v_d.respondent_org_id), 'Worker')
           else null end,
         m.body, m.created_at
  from public.dispute_messages m
  left join public.profiles p on p.id = m.author_id
  where m.dispute_id = p_dispute_id
  order by m.created_at, m.id;
end;
$$;

-- Disputes about one piece of work that the viewer is part of.
create or replace function public.work_disputes(p_context public.work_context, p_target uuid)
returns table (id uuid, opener_side text, reason public.dispute_reason, status public.dispute_status, outcome public.dispute_outcome, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if app.my_side(p_context, p_target, false) is null and not app.is_admin() then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  return query
  select d.id, d.opener_side, d.reason, d.status, d.outcome, d.created_at
  from public.disputes d
  where d.target_id = p_target and d.context = p_context
  order by d.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function app.work_parties(public.work_context, uuid) from public;
revoke all on function app.my_side(public.work_context, uuid, boolean) from public;
revoke all on function app.review_published(public.reviews) from public;
revoke all on function app.is_review_subject(public.reviews) from public;
revoke all on function app.is_review_author(public.reviews) from public;
revoke all on function app.rating_of(uuid, uuid) from public;
revoke all on function app.dispute_side(public.disputes) from public;
revoke all on function app.dispute_link(uuid, uuid) from public;
revoke all on function app.notify_dispute_side(uuid, uuid, uuid, text, text, text) from public;
revoke all on function app.notify_staff(text, text, text, text) from public;
revoke all on function app.dispute_rows(uuid, uuid, boolean, public.dispute_status) from public;
-- Used by row level security policies.
grant execute on function app.review_published(public.reviews) to authenticated;
grant execute on function app.is_review_subject(public.reviews) to authenticated;
grant execute on function app.is_review_author(public.reviews) to authenticated;
grant execute on function app.dispute_side(public.disputes) to authenticated;

revoke all on function public.submit_review(public.work_context, uuid, int, text) from public;
revoke all on function public.work_reviews(public.work_context, uuid) from public;
revoke all on function public.org_reviews(uuid) from public;
revoke all on function public.my_worker_reviews() from public;
revoke all on function public.org_rating(uuid) from public;
revoke all on function public.my_worker_rating() from public;
revoke all on function public.reply_to_review(uuid, text) from public;
revoke all on function public.flag_review(uuid, text) from public;
revoke all on function public.moderate_review(uuid, boolean, text) from public;
revoke all on function public.admin_reviews(text) from public;
revoke all on function public.job_worker_ratings(uuid) from public;
revoke all on function public.request_customer_rating(uuid) from public;
revoke all on function public.contractor_directory(uuid, uuid, uuid) from public;
revoke all on function public.subcontractor_directory(uuid, uuid) from public;
revoke all on function public.open_dispute(public.work_context, uuid, public.dispute_reason, text, text) from public;
revoke all on function public.post_dispute_message(uuid, text) from public;
revoke all on function public.withdraw_dispute(uuid, text) from public;
revoke all on function public.resolve_dispute(uuid, public.dispute_outcome, text) from public;
revoke all on function public.list_disputes(uuid, public.dispute_status) from public;
revoke all on function public.admin_disputes(public.dispute_status) from public;
revoke all on function public.get_dispute(uuid) from public;
revoke all on function public.dispute_thread(uuid) from public;
revoke all on function public.work_disputes(public.work_context, uuid) from public;
grant execute on function public.submit_review(public.work_context, uuid, int, text) to authenticated;
grant execute on function public.work_reviews(public.work_context, uuid) to authenticated;
grant execute on function public.org_reviews(uuid) to authenticated;
grant execute on function public.my_worker_reviews() to authenticated;
grant execute on function public.org_rating(uuid) to authenticated;
grant execute on function public.my_worker_rating() to authenticated;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
grant execute on function public.flag_review(uuid, text) to authenticated;
grant execute on function public.moderate_review(uuid, boolean, text) to authenticated;
grant execute on function public.admin_reviews(text) to authenticated;
grant execute on function public.job_worker_ratings(uuid) to authenticated;
grant execute on function public.request_customer_rating(uuid) to authenticated;
grant execute on function public.contractor_directory(uuid, uuid, uuid) to authenticated;
grant execute on function public.subcontractor_directory(uuid, uuid) to authenticated;
grant execute on function public.open_dispute(public.work_context, uuid, public.dispute_reason, text, text) to authenticated;
grant execute on function public.post_dispute_message(uuid, text) to authenticated;
grant execute on function public.withdraw_dispute(uuid, text) to authenticated;
grant execute on function public.resolve_dispute(uuid, public.dispute_outcome, text) to authenticated;
grant execute on function public.list_disputes(uuid, public.dispute_status) to authenticated;
grant execute on function public.admin_disputes(public.dispute_status) to authenticated;
grant execute on function public.get_dispute(uuid) to authenticated;
grant execute on function public.dispute_thread(uuid) to authenticated;
grant execute on function public.work_disputes(public.work_context, uuid) to authenticated;
