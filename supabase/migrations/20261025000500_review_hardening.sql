-- Review hardening (PR #1 review):
--   1. A contractor can only be approved (or reinstated) with a general
--      liability certificate that staff reviewed and that has not expired.
--   2. Material changes to an approved contractor or worker send it back to
--      staff review automatically; other edits do not.
--   3. Service areas must belong to the contractor's market (contractors) or
--      an open market (workers), enforced in the database.

-- ---------------------------------------------------------------------------
-- 1. Insurance conditions for approval
-- ---------------------------------------------------------------------------
create or replace function app.is_insurance_type(p_type public.document_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in ('general_liability_coi', 'workers_comp_coi', 'auto_liability_coi');
$$;

-- True when staff approved a general liability certificate for the org that
-- has an expiration date today or later. This is the bar for approval.
create or replace function app.org_has_reviewed_insurance(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.qualification_documents
    where organization_id = p_org_id
      and doc_type = 'general_liability_coi'
      and status = 'approved'
      and expires_on is not null
      and expires_on >= current_date
  );
$$;

-- Summary used by dashboards: current | pending_review | expired | rejected | missing.
create or replace function public.organization_insurance_status(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not (app.is_org_member(p_org_id) or app.is_admin()) then null
    when app.org_has_reviewed_insurance(p_org_id) then 'current'
    when exists (
      select 1 from public.qualification_documents
      where organization_id = p_org_id and doc_type = 'general_liability_coi'
        and status = 'pending' and (expires_on is null or expires_on >= current_date)
    ) then 'pending_review'
    when exists (
      select 1 from public.qualification_documents
      where organization_id = p_org_id and doc_type = 'general_liability_coi'
        and status = 'approved' and expires_on < current_date
    ) then 'expired'
    when exists (
      select 1 from public.qualification_documents
      where organization_id = p_org_id and doc_type = 'general_liability_coi' and status = 'rejected'
    ) then 'rejected'
    else 'missing'
  end;
$$;

revoke all on function public.organization_insurance_status(uuid) from public;
grant execute on function public.organization_insurance_status(uuid) to authenticated;

-- Insurance certificates can only be approved with an expiration date, and
-- not once they have expired.
create or replace function public.review_document(
  p_document_id uuid,
  p_decision public.document_status,
  p_notes text,
  p_expires_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.qualification_documents;
  v_expires date;
begin
  if not app.is_admin() then
    raise exception 'Only QuickPro staff can review documents.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'A review decision must be approved or rejected.' using errcode = 'P0001';
  end if;
  if p_decision = 'rejected' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'A note explaining the rejection is required.' using errcode = 'P0001';
  end if;
  select * into v_doc from public.qualification_documents where id = p_document_id for update;
  if not found then
    raise exception 'Document not found.' using errcode = 'P0002';
  end if;

  v_expires := coalesce(p_expires_on, v_doc.expires_on);
  if p_decision = 'approved' and app.is_insurance_type(v_doc.doc_type) then
    if v_expires is null then
      raise exception 'Enter the policy expiration date before approving an insurance certificate.' using errcode = 'P0001';
    end if;
    if v_expires < current_date then
      raise exception 'This certificate has expired and cannot be approved.' using errcode = 'P0001';
    end if;
  end if;

  update public.qualification_documents
     set status = p_decision,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_notes = nullif(btrim(p_notes), ''),
         expires_on = v_expires
   where id = p_document_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Re-review on material changes
-- ---------------------------------------------------------------------------
alter table public.organizations add column rereview_reason text
  check (rereview_reason is null or char_length(rereview_reason) <= 1000);
alter table public.worker_profiles add column rereview_reason text
  check (rereview_reason is null or char_length(rereview_reason) <= 1000);

-- Moves an approved organization back to review, or adds to the reasons of
-- one already waiting on re-review. Staff edits and platform operations (no
-- signed-in user, e.g. migrations or support scripts) never trigger it.
create or replace function app.flag_org_rereview(p_org_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or app.is_admin() then
    return;
  end if;
  update public.organizations
     set status = 'pending_review',
         submitted_at = now(),
         rereview_reason = left(concat_ws('; ', rereview_reason, p_reason), 1000)
   where id = p_org_id
     and (status = 'approved' or (status = 'pending_review' and rereview_reason is not null));
end;
$$;

create or replace function app.flag_worker_rereview(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or app.is_admin() then
    return;
  end if;
  update public.worker_profiles
     set status = 'pending_review',
         submitted_at = now(),
         rereview_reason = left(concat_ws('; ', rereview_reason, p_reason), 1000)
   where user_id = p_user_id
     and (status = 'approved' or (status = 'pending_review' and rereview_reason is not null));
end;
$$;

revoke all on function app.flag_org_rereview(uuid, text) from public;
revoke all on function app.flag_worker_rereview(uuid, text) from public;

-- Organization identity rules, replacing the Phase 1 lock:
--   draft / rejected  : everything editable by managers
--   pending_review    : name, legal name, market locked (staff are reviewing them)
--   approved          : name or legal name change -> back to review; market staff-only
--   suspended         : name, legal name, market locked
create or replace function app.guard_reviewed_org_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_identity_changed boolean := new.name is distinct from old.name
                                or new.legal_name is distinct from old.legal_name;
begin
  if auth.uid() is null or app.is_admin() then
    return new;
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'The organization type cannot be changed.' using errcode = 'P0001';
  end if;
  if new.market_id is distinct from old.market_id and old.status <> 'draft' and old.status <> 'rejected' then
    raise exception 'Only QuickPro staff can move a submitted organization to another market.' using errcode = 'P0001';
  end if;
  if v_identity_changed and old.status in ('pending_review', 'suspended') then
    raise exception 'The business name and legal name cannot be changed while %.',
      case old.status when 'pending_review' then 'QuickPro staff are reviewing them' else 'the organization is suspended' end
      using errcode = 'P0001';
  end if;
  if v_identity_changed and old.status = 'approved' and new.status = 'approved' then
    new.status := 'pending_review';
    new.submitted_at := now();
    new.rereview_reason := left(concat_ws('; ', old.rereview_reason, 'Business name or legal name changed'), 1000);
  end if;
  return new;
end;
$$;

-- Adding a service category claims new work staff have not reviewed.
-- Removing categories and changing towns within the market do not.
create or replace function app.on_contractor_service_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.flag_org_rereview(
    new.organization_id,
    'Added service category: ' || (select name from public.service_categories where id = new.category_id)
  );
  return null;
end;
$$;

create trigger contractor_service_added after insert on public.contractor_services
  for each row execute function app.on_contractor_service_added();

-- Workers: a new skill or a change of legal name goes back to review.
-- Availability, towns, travel, pay, headline and bio do not.
create or replace function app.on_worker_skill_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.flag_worker_rereview(
    new.user_id,
    'Added skill: ' || (select name from public.skills where id = new.skill_id)
  );
  return null;
end;
$$;

create trigger worker_skill_added after insert on public.worker_skills
  for each row execute function app.on_worker_skill_added();

create or replace function app.on_profile_name_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.flag_worker_rereview(new.id, 'Full name changed');
  return null;
end;
$$;

create trigger profile_name_changed after update of full_name on public.profiles
  for each row
  when (old.full_name is distinct from new.full_name)
  execute function app.on_profile_name_changed();

-- Review decisions clear the re-review reason. Approval of a contractor now
-- requires reviewed, unexpired general liability insurance.
create or replace function public.review_organization(
  p_org_id uuid,
  p_decision public.review_status,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  if not app.is_admin() then
    raise exception 'Only QuickPro staff can review organizations.' using errcode = '42501';
  end if;
  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  perform app.assert_review_transition(v_org.status, p_decision, p_notes);

  if p_decision = 'approved' and v_org.kind = 'contractor' and not app.org_has_reviewed_insurance(p_org_id) then
    raise exception 'Approve a current general liability certificate (with an expiration date) before approving this contractor.'
      using errcode = 'P0001';
  end if;

  update public.organizations
     set status = p_decision,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_notes = nullif(btrim(p_notes), ''),
         rereview_reason = null
   where id = p_org_id;
end;
$$;

create or replace function public.review_worker_profile(
  p_user_id uuid,
  p_decision public.review_status,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.review_status;
begin
  if not app.is_admin() then
    raise exception 'Only QuickPro staff can review worker profiles.' using errcode = '42501';
  end if;
  select status into v_status from public.worker_profiles where user_id = p_user_id for update;
  if not found then
    raise exception 'Worker profile not found.' using errcode = 'P0002';
  end if;
  perform app.assert_review_transition(v_status, p_decision, p_notes);

  update public.worker_profiles
     set status = p_decision,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_notes = nullif(btrim(p_notes), ''),
         rereview_reason = null
   where user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Market boundaries for service areas
-- ---------------------------------------------------------------------------
create or replace function app.check_contractor_area_market()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.service_areas a
    join public.organizations o on o.market_id = a.market_id
    where a.id = new.service_area_id and o.id = new.organization_id
  ) then
    raise exception 'That service area is outside this organization''s market.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger contractor_service_area_market before insert or update on public.contractor_service_areas
  for each row execute function app.check_contractor_area_market();

-- A market move (staff only after submission) must not strand areas.
create or replace function app.check_org_market_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.contractor_service_areas s
    join public.service_areas a on a.id = s.service_area_id
    where s.organization_id = new.id and a.market_id <> new.market_id
  ) then
    raise exception 'Remove service areas outside the new market first.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.markets where id = new.market_id and is_active) then
    raise exception 'QuickPro is not open in that market yet.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger organizations_market_change before update of market_id on public.organizations
  for each row
  when (old.market_id is distinct from new.market_id)
  execute function app.check_org_market_change();

create or replace function app.check_open_market_area(p_area_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_area_id is not null and not exists (
    select 1 from public.service_areas a join public.markets m on m.id = a.market_id
    where a.id = p_area_id and m.is_active
  ) then
    raise exception 'That area is not in a market QuickPro serves yet.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function app.check_worker_area_market()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'worker_profiles' then
    if tg_op = 'INSERT' or new.home_service_area_id is distinct from old.home_service_area_id then
      perform app.check_open_market_area(new.home_service_area_id);
    end if;
  else
    perform app.check_open_market_area(new.service_area_id);
  end if;
  return new;
end;
$$;

create trigger worker_home_area_market before insert or update of home_service_area_id on public.worker_profiles
  for each row execute function app.check_worker_area_market();
create trigger worker_service_area_market before insert or update on public.worker_service_areas
  for each row execute function app.check_worker_area_market();
