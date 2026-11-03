-- Public contractor profiles: an approved contractor can choose to publish a
-- profile page at /contractors/<address>. Only what is safe to show anyone
-- is exposed, through read-only functions the anonymous role can call:
-- name, description, services, towns, years in business, crew size, rating,
-- published reviews from customers and prime contractors, and whether a
-- current liability certificate has been reviewed by staff. No contact
-- details, addresses, documents or people's names.
--
-- Nothing here deletes or drops anything. Unpublishing sets is_published to
-- false; the row stays.

create table public.contractor_public_profiles (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- The page address: lowercase letters, numbers and single hyphens.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  is_published boolean not null default false,
  published_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_published or published_at is not null)
);

create trigger contractor_public_profiles_touch before update on public.contractor_public_profiles
  for each row execute function app.touch_updated_at();

alter table public.contractor_public_profiles enable row level security;
create policy "members and staff read public profile settings"
  on public.contractor_public_profiles for select to authenticated
  using (app.is_org_member(organization_id) or app.is_admin());
grant select on public.contractor_public_profiles to authenticated;

create trigger audit_contractor_public_profiles after insert or update or delete on public.contractor_public_profiles
  for each row execute function app.audit_row_change('public_profile', 'organization_id', 'organization_id');

-- Publish or unpublish, and choose the address. Owners and admins only, and
-- only an approved contractor can be published.
create or replace function public.set_public_profile(p_org_id uuid, p_publish boolean, p_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  select * into v_org from public.organizations where id = p_org_id;
  if v_org.id is null or not (app.is_org_member(p_org_id) or app.is_admin()) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  if not app.can_manage_org(p_org_id) then
    raise exception 'Only owners and admins can change the public profile.' using errcode = 'P0001';
  end if;
  if v_org.kind <> 'contractor' then
    raise exception 'Public profiles are for contractor businesses.' using errcode = 'P0001';
  end if;
  if coalesce(p_publish, false) and v_org.status <> 'approved' then
    raise exception 'Your business can be published once QuickPro staff approve it.' using errcode = 'P0001';
  end if;
  v_slug := regexp_replace(regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g');
  if char_length(v_slug) < 3 or char_length(v_slug) > 60 then
    raise exception 'Choose a page address of 3 to 60 letters or numbers.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.contractor_public_profiles where slug = v_slug and organization_id <> p_org_id) then
    raise exception 'That page address is taken. Try adding your town.' using errcode = 'P0001';
  end if;

  insert into public.contractor_public_profiles (organization_id, slug, is_published, published_at, updated_by)
  values (p_org_id, v_slug, coalesce(p_publish, false), case when p_publish then now() end, auth.uid())
  on conflict (organization_id) do update
     set slug = excluded.slug,
         is_published = excluded.is_published,
         published_at = case when excluded.is_published
                             then coalesce(public.contractor_public_profiles.published_at, now()) end,
         updated_by = excluded.updated_by;
  return v_slug;
end;
$$;

-- Published, approved contractors in open markets.
create or replace function app.public_contractor_rows()
returns table (
  organization_id uuid,
  slug text,
  name text,
  description text,
  city text,
  market_name text,
  years_in_business int,
  crew_size int,
  services text[],
  service_slugs text[],
  areas text[],
  area_slugs text[],
  rating_avg numeric,
  rating_count int,
  insurance_reviewed boolean,
  on_quickpro_since date
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, p.slug, o.name, o.description, o.city, mk.name,
         o.years_in_business, o.crew_size,
         coalesce((select array_agg(c.name order by c.sort_order) from public.contractor_services cs
                     join public.service_categories c on c.id = cs.category_id
                   where cs.organization_id = o.id and c.is_active), '{}'),
         coalesce((select array_agg(c.slug order by c.sort_order) from public.contractor_services cs
                     join public.service_categories c on c.id = cs.category_id
                   where cs.organization_id = o.id and c.is_active), '{}'),
         coalesce((select array_agg(a.name order by a.name) from public.contractor_service_areas ca
                     join public.service_areas a on a.id = ca.service_area_id
                   where ca.organization_id = o.id), '{}'),
         coalesce((select array_agg(a.slug order by a.name) from public.contractor_service_areas ca
                     join public.service_areas a on a.id = ca.service_area_id
                   where ca.organization_id = o.id), '{}'),
         r.rating_avg, r.rating_count,
         app.org_has_reviewed_insurance(o.id),
         (coalesce(o.reviewed_at, o.created_at) at time zone 'America/New_York')::date
  from public.contractor_public_profiles p
  join public.organizations o on o.id = p.organization_id
  join public.markets mk on mk.id = o.market_id
  cross join lateral app.rating_of(o.id, null) r
  where p.is_published and o.kind = 'contractor' and o.status = 'approved' and mk.is_active;
$$;

-- The public directory, optionally by service category and town (slugs).
create or replace function public.public_contractors(p_category text, p_area text)
returns table (
  slug text,
  name text,
  description text,
  city text,
  market_name text,
  years_in_business int,
  crew_size int,
  services text[],
  areas text[],
  rating_avg numeric,
  rating_count int,
  insurance_reviewed boolean,
  on_quickpro_since date
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.slug, r.name, left(r.description, 280), r.city, r.market_name, r.years_in_business, r.crew_size,
         r.services, r.areas, r.rating_avg, r.rating_count, r.insurance_reviewed, r.on_quickpro_since
  from app.public_contractor_rows() r
  where (nullif(p_category, '') is null or p_category = any (r.service_slugs))
    and (nullif(p_area, '') is null or p_area = any (r.area_slugs))
  order by r.rating_count > 0 desc, r.rating_avg desc nulls last, r.name
  limit 200;
$$;

create or replace function public.public_contractor(p_slug text)
returns table (
  slug text,
  name text,
  description text,
  city text,
  market_name text,
  years_in_business int,
  crew_size int,
  services text[],
  areas text[],
  rating_avg numeric,
  rating_count int,
  insurance_reviewed boolean,
  on_quickpro_since date,
  completed_projects int
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.slug, r.name, r.description, r.city, r.market_name, r.years_in_business, r.crew_size,
         r.services, r.areas, r.rating_avg, r.rating_count, r.insurance_reviewed, r.on_quickpro_since,
         (select count(*)::int from public.service_requests sr
            join public.quotes q on q.id = sr.awarded_quote_id
          where q.contractor_id = r.organization_id and sr.status = 'completed')
  from app.public_contractor_rows() r
  where r.slug = lower(btrim(coalesce(p_slug, '')));
$$;

-- Published, visible reviews of the contractor from customers and prime
-- contractors. Reviewers are described, not named.
create or replace function public.public_contractor_reviews(p_slug text)
returns table (
  rating int,
  body text,
  reply text,
  reviewer text,
  area_name text,
  reviewed_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.rating::int, v.body, v.reply,
         case v.author_side when 'customer' then 'Customer' else 'Contractor that subcontracted work' end,
         a.name,
         (v.created_at at time zone 'America/New_York')::date
  from app.public_contractor_rows() r
  join public.reviews v on v.subject_org_id = r.organization_id
  left join public.subcontracts s on s.id = v.subcontract_id
  left join public.service_requests sr on sr.id = coalesce(v.request_id, s.request_id)
  left join public.service_areas a on a.id = sr.service_area_id
  where r.slug = lower(btrim(coalesce(p_slug, '')))
    and v.hidden_at is null
    and v.author_side in ('customer', 'prime')
    and app.review_published(v)
  order by v.created_at desc
  limit 50;
$$;

revoke all on function public.set_public_profile(uuid, boolean, text) from public;
revoke all on function app.public_contractor_rows() from public;
revoke all on function public.public_contractors(text, text) from public;
revoke all on function public.public_contractor(text) from public;
revoke all on function public.public_contractor_reviews(text) from public;
grant execute on function public.set_public_profile(uuid, boolean, text) to authenticated;
grant execute on function public.public_contractors(text, text) to anon, authenticated;
grant execute on function public.public_contractor(text) to anon, authenticated;
grant execute on function public.public_contractor_reviews(text) to anon, authenticated;
