-- Read-only checks run after `supabase db push` against a hosted project.
-- Prints a summary and raises an error if anything QuickPro relies on is
-- missing or open. Changes nothing.
\set ON_ERROR_STOP on

\echo '== Applied migrations'
select version, name from supabase_migrations.schema_migrations order by version;

\echo '== Tables in public: row level security and policy counts'
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by 1;

\echo '== Storage bucket'
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'qualification-documents';

\echo '== Storage policies on objects (expected: none)'
select policyname, roles, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects';

\echo '== Reference data'
select (select count(*) from public.markets where is_active) as active_markets,
       (select count(*) from public.service_areas) as service_areas,
       (select count(*) from public.service_categories) as categories,
       (select count(*) from public.skills) as skills,
       (select count(*) from public.engagement_types where is_active) as engagement_types;

do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ') into v_missing
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
  if v_missing is not null then
    raise exception 'Row level security is off on: %', v_missing;
  end if;

  select string_agg(t, ', ') into v_missing
  from unnest(array['profiles', 'organizations', 'organization_members', 'contractor_services',
                    'contractor_service_areas', 'worker_profiles', 'worker_skills', 'worker_service_areas',
                    'worker_availability', 'qualification_documents', 'audit_log', 'markets',
                    'service_areas', 'service_categories', 'skills', 'engagement_types', 'jobs',
                    'job_skills', 'job_sites', 'job_applications', 'job_assignments']) t
  where to_regclass('public.' || t) is null;
  if v_missing is not null then
    raise exception 'Missing tables: %', v_missing;
  end if;

  if not exists (select 1 from storage.buckets where id = 'qualification-documents' and not public) then
    raise exception 'The private qualification-documents bucket is missing or public.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and (roles && array['anon', 'authenticated', 'public']::name[])) then
    raise exception 'storage.objects has policies for client roles; documents must be server-only.';
  end if;

  select string_agg(table_name || ':' || privilege_type, ', ') into v_missing
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT';
  if v_missing is not null then
    raise exception 'anon can write to: %', v_missing;
  end if;
  select string_agg(table_name, ', ') into v_missing
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'
    and table_name not in ('markets', 'service_areas', 'service_categories', 'skills', 'engagement_types');
  if v_missing is not null then
    raise exception 'anon can read non-reference tables: %', v_missing;
  end if;

  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal
                 and tgfoid = 'app.handle_new_auth_user'::regproc) then
    raise exception 'The trigger that creates profiles for new accounts is missing.';
  end if;

  if (select count(*) from public.markets where is_active) <> 1 then
    raise exception 'Expected exactly one open market (Suffolk County).';
  end if;
end;
$$;

\echo '== All checks passed'
