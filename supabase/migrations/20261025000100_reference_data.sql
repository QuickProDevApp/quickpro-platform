-- QuickPro foundation: reference data (markets, service areas, categories, skills).
-- Reference data is required in every environment, so it lives in a migration
-- rather than in seed.sql.

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- Supabase grants every privilege on new public tables and functions to the
-- API roles by default. QuickPro grants explicitly instead (column-level for
-- writes), so new objects start closed.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
alter default privileges in schema app revoke all on functions from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.review_status as enum (
  'draft',           -- being filled in by the owner
  'pending_review',  -- submitted, waiting on QuickPro staff
  'approved',
  'rejected',        -- owner may edit and resubmit
  'suspended'        -- set by staff only
);

create type public.organization_kind as enum ('contractor', 'customer');

create type public.org_member_role as enum ('owner', 'admin', 'dispatcher', 'member');

create type public.platform_role as enum ('member', 'admin');

create type public.document_status as enum ('pending', 'approved', 'rejected');

create type public.document_type as enum (
  'general_liability_coi',
  'workers_comp_coi',
  'auto_liability_coi',
  'business_license',
  'certification',
  'other'
);

-- ---------------------------------------------------------------------------
-- Markets and service areas
-- ---------------------------------------------------------------------------
create table public.markets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  state_code char(2) not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  kind text not null default 'town' check (kind in ('town', 'city')),
  created_at timestamptz not null default now(),
  unique (market_id, slug)
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  sort_order int not null default 0
);

alter table public.markets enable row level security;
alter table public.service_areas enable row level security;
alter table public.service_categories enable row level security;
alter table public.skills enable row level security;

-- Reference data is public and read-only through the API roles. Changes go
-- through migrations.
create policy "reference data is readable" on public.markets for select using (true);
create policy "reference data is readable" on public.service_areas for select using (true);
create policy "reference data is readable" on public.service_categories for select using (true);
create policy "reference data is readable" on public.skills for select using (true);

grant select on public.markets, public.service_areas, public.service_categories, public.skills
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed values: Suffolk County is the launch market. Nassau County is defined
-- but inactive so the data model is exercised for expansion.
-- ---------------------------------------------------------------------------
insert into public.markets (slug, name, state_code, is_active) values
  ('suffolk-county-ny', 'Suffolk County', 'NY', true),
  ('nassau-county-ny', 'Nassau County', 'NY', false);

insert into public.service_areas (market_id, slug, name, kind)
select m.id, a.slug, a.name, a.kind
from public.markets m
join (values
  ('suffolk-county-ny', 'babylon', 'Babylon', 'town'),
  ('suffolk-county-ny', 'brookhaven', 'Brookhaven', 'town'),
  ('suffolk-county-ny', 'east-hampton', 'East Hampton', 'town'),
  ('suffolk-county-ny', 'huntington', 'Huntington', 'town'),
  ('suffolk-county-ny', 'islip', 'Islip', 'town'),
  ('suffolk-county-ny', 'riverhead', 'Riverhead', 'town'),
  ('suffolk-county-ny', 'shelter-island', 'Shelter Island', 'town'),
  ('suffolk-county-ny', 'smithtown', 'Smithtown', 'town'),
  ('suffolk-county-ny', 'southampton', 'Southampton', 'town'),
  ('suffolk-county-ny', 'southold', 'Southold', 'town'),
  ('nassau-county-ny', 'hempstead', 'Hempstead', 'town'),
  ('nassau-county-ny', 'north-hempstead', 'North Hempstead', 'town'),
  ('nassau-county-ny', 'oyster-bay', 'Oyster Bay', 'town'),
  ('nassau-county-ny', 'glen-cove', 'Glen Cove', 'city'),
  ('nassau-county-ny', 'long-beach', 'Long Beach', 'city')
) as a (market_slug, slug, name, kind) on a.market_slug = m.slug;

insert into public.service_categories (slug, name, description, sort_order) values
  ('commercial-cleaning', 'Commercial cleaning', 'Janitorial, office, retail, post-construction and event cleaning.', 1),
  ('pressure-washing', 'Pressure washing', 'Building exteriors, sidewalks, parking structures, fleet and dumpster pads.', 2),
  ('landscaping', 'Landscaping', 'Grounds maintenance, mowing, planting, seasonal cleanups and snow removal.', 3),
  ('facility-services', 'Facility services', 'General maintenance, porter services, light repairs and set-up/tear-down.', 4);

insert into public.skills (category_id, slug, name, sort_order)
select c.id, s.slug, s.name, s.sort_order
from public.service_categories c
join (values
  ('commercial-cleaning', 'general-janitorial', 'General janitorial', 1),
  ('commercial-cleaning', 'floor-care', 'Floor care (strip, wax, buff)', 2),
  ('commercial-cleaning', 'carpet-extraction', 'Carpet extraction', 3),
  ('commercial-cleaning', 'window-cleaning', 'Window cleaning', 4),
  ('commercial-cleaning', 'post-construction-cleaning', 'Post-construction cleaning', 5),
  ('pressure-washing', 'pressure-washer-operation', 'Pressure washer operation', 10),
  ('pressure-washing', 'soft-washing', 'Soft washing', 11),
  ('pressure-washing', 'surface-cleaner', 'Flat surface cleaner', 12),
  ('landscaping', 'mowing-trimming', 'Mowing and trimming', 20),
  ('landscaping', 'planting-mulching', 'Planting and mulching', 21),
  ('landscaping', 'seasonal-cleanup', 'Seasonal cleanup', 22),
  ('landscaping', 'snow-removal', 'Snow removal', 23),
  ('facility-services', 'porter-services', 'Day porter services', 30),
  ('facility-services', 'general-maintenance', 'General maintenance', 31),
  ('facility-services', 'event-setup', 'Event set-up and tear-down', 32)
) as s (category_slug, slug, name, sort_order) on s.category_slug = c.slug;

insert into public.skills (category_id, slug, name, sort_order) values
  (null, 'crew-lead', 'Crew lead / supervisor', 40),
  (null, 'equipment-transport', 'Can transport equipment', 41),
  (null, 'bilingual-english-spanish', 'Bilingual (English / Spanish)', 42);
