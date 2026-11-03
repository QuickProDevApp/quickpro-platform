-- Show customers the work on their project. The awarded contractor's
-- dispatchers choose which job photos the customer sees; the customer sees
-- those photos and the checklist progress of each job on the project.
--
-- Photos stay private to the business and the booked crew unless shared.
-- Workers' names and checklist notes are never shown to the customer.
--
-- Nothing here deletes or drops anything. It adds two columns and replaces
-- the photo insert trigger function so new photos always start unshared.

alter table public.job_photos
  add column shared_at timestamptz,
  add column shared_by uuid references public.profiles (id) on delete set null;

-- shared_at/shared_by are not in the insert grant; the trigger makes sure.
create or replace function app.before_job_photo_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  new.hidden_at := null;
  new.hidden_by := null;
  new.shared_at := null;
  new.shared_by := null;
  select organization_id into new.organization_id from public.jobs where id = new.job_id;
  if new.storage_path not like 'job/' || new.job_id || '/' || new.id || '.%' then
    raise exception 'Invalid storage path.' using errcode = 'P0001';
  end if;
  if new.checklist_item_id is not null and not exists (
    select 1 from public.job_checklist_items
    where id = new.checklist_item_id and job_id = new.job_id and removed_at is null
  ) then
    raise exception 'That checklist item isn''t on this job.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.job_photos where job_id = new.job_id and hidden_at is null) >= 40 then
    raise exception 'A job can have up to 40 photos.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The customer a job's photos can be shared with: only for jobs the
-- awarded contractor runs on a live or finished project, and only for that
-- contractor's dispatchers. Returns the customer's name, or null.
create or replace function public.job_photo_sharing(p_job_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.name
  from public.jobs j
  join public.service_requests r on r.id = j.service_request_id
  join public.quotes q on q.id = r.awarded_quote_id
  join public.organizations c on c.id = r.organization_id
  where j.id = p_job_id
    and q.contractor_id = j.organization_id
    and r.status in ('awarded', 'completed')
    and j.status <> 'cancelled'
    and app.can_dispatch(j.organization_id);
$$;

-- Share a photo with the customer, or stop sharing it. The customer's
-- dispatchers get one notification per job every six hours at most.
create or replace function public.share_job_photo(p_photo_id uuid, p_shared boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.job_photos;
  v_job public.jobs;
  v_request public.service_requests;
begin
  select * into v_photo from public.job_photos where id = p_photo_id for update;
  if v_photo.id is null or v_photo.hidden_at is not null
     or not (app.is_org_member(v_photo.organization_id) or app.is_admin()) then
    raise exception 'Photo not found.' using errcode = 'P0002';
  end if;
  if not app.can_dispatch(v_photo.organization_id) then
    raise exception 'Only owners, admins and dispatchers can share photos with the customer.' using errcode = 'P0001';
  end if;
  if public.job_photo_sharing(v_photo.job_id) is null then
    raise exception 'Photos can be shared only on jobs you run for a customer project.' using errcode = 'P0001';
  end if;

  if coalesce(p_shared, false) then
    if v_photo.shared_at is not null then
      return;
    end if;
    update public.job_photos set shared_at = now(), shared_by = auth.uid() where id = p_photo_id;
    select * into v_job from public.jobs where id = v_photo.job_id;
    select * into v_request from public.service_requests where id = v_job.service_request_id;
    if not exists (
      select 1 from public.notifications
      where job_id = v_job.id and kind = 'project.photos_shared' and created_at > now() - interval '6 hours'
    ) then
      perform app.notify_dispatchers(
        v_request.organization_id, 'project.photos_shared', 'New photos: ' || v_request.title,
        'Your contractor shared photos from ' || v_job.title || '.',
        '/app/org/' || v_request.organization_id || '/requests/' || v_request.id, v_job.id);
    end if;
  else
    update public.job_photos set shared_at = null, shared_by = null where id = p_photo_id;
  end if;
end;
$$;

-- Shared photos on a project, for the customer, the awarded contractor and
-- staff. No uploader names.
create or replace function public.request_job_photos(p_request_id uuid)
returns table (
  id uuid,
  job_id uuid,
  job_title text,
  caption text,
  checklist_label text,
  created_at timestamptz,
  shared_at timestamptz
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
  select p.id, p.job_id, j.title, p.caption, i.label, p.created_at, p.shared_at
  from public.job_photos p
  join public.jobs j on j.id = p.job_id
  left join public.job_checklist_items i on i.id = p.checklist_item_id
  where j.service_request_id = p_request_id
    and p.hidden_at is null and p.shared_at is not null
  order by p.created_at, p.id;
end;
$$;

-- The file behind a shared photo, for someone who can see the project.
create or replace function public.shared_job_photo_file(p_photo_id uuid)
returns table (storage_path text, mime_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.storage_path, p.mime_type
  from public.job_photos p
  join public.jobs j on j.id = p.job_id
  where p.id = p_photo_id and p.hidden_at is null and p.shared_at is not null
    and j.service_request_id is not null and app.can_see_request_site(j.service_request_id);
$$;

-- Checklist progress for each job on a project: labels and done state only,
-- with the same reach as request_jobs (subcontractors see their own jobs).
create or replace function public.request_job_checklists(p_request_id uuid)
returns table (
  job_id uuid,
  item_id uuid,
  label text,
  done_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := app.can_see_request_site(p_request_id);
begin
  if not v_full and not app.is_project_sub(p_request_id) then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  return query
  select i.job_id, i.id, i.label, i.done_at
  from public.job_checklist_items i
  join public.jobs j on j.id = i.job_id
  where j.service_request_id = p_request_id and i.removed_at is null
    and (v_full or app.is_org_member(j.organization_id))
  order by j.starts_at, j.id, i.position;
end;
$$;

revoke all on function public.job_photo_sharing(uuid) from public;
revoke all on function public.share_job_photo(uuid, boolean) from public;
revoke all on function public.request_job_photos(uuid) from public;
revoke all on function public.shared_job_photo_file(uuid) from public;
revoke all on function public.request_job_checklists(uuid) from public;
grant execute on function public.job_photo_sharing(uuid) to authenticated;
grant execute on function public.share_job_photo(uuid, boolean) to authenticated;
grant execute on function public.request_job_photos(uuid) to authenticated;
grant execute on function public.shared_job_photo_file(uuid) to authenticated;
grant execute on function public.request_job_checklists(uuid) to authenticated;
