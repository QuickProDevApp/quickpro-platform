-- Job photos: proof of work. The booked crew (once checked in) and the
-- business's dispatchers add photos to a job, optionally for a checklist
-- item. The business, staff and the booked crew see them. Files live in the
-- same private bucket as qualification documents, under job/<job id>/, and
-- are served only through the app after a row level security check.
--
-- Nothing here deletes or drops anything. Taking a photo off a job sets
-- hidden_at; the row and the file stay on file for QuickPro staff.

create table public.job_photos (
  id uuid primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  checklist_item_id uuid references public.job_checklist_items (id) on delete set null,
  caption text check (caption is null or char_length(caption) <= 200),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  size_bytes int not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique check (storage_path ~ '^job/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$'),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null
);

create index job_photos_job_idx on public.job_photos (job_id, created_at);

-- Who may add a photo to a job right now: dispatchers while it's open or
-- filled; booked crew once checked in, until two hours after the end.
create or replace function app.can_add_job_photo(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id
      and j.status in ('open', 'filled')
      and (
        app.can_dispatch(j.organization_id)
        or exists (
          select 1 from public.job_assignments a
          where a.job_id = j.id and a.worker_user_id = (select auth.uid())
            and a.status = 'accepted' and a.checked_in_at is not null
            and now() <= j.ends_at + interval '2 hours'
        )
      )
  );
$$;

-- Server-controlled fields and the per-job limit.
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

create trigger job_photos_before_insert before insert on public.job_photos
  for each row execute function app.before_job_photo_insert();

alter table public.job_photos enable row level security;

-- The business and the booked crew see photos still on the job; staff see all.
create policy "business, staff and booked crew read job photos"
  on public.job_photos for select to authenticated
  using (
    app.is_admin()
    or (hidden_at is null and (app.is_org_member(organization_id) or app.worker_accepted_on_job(job_id)))
  );

create policy "dispatchers and checked-in crew add job photos"
  on public.job_photos for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and app.can_add_job_photo(job_id));

grant select on public.job_photos to authenticated;
grant insert (id, job_id, organization_id, checklist_item_id, caption, file_name, mime_type, size_bytes, sha256,
              storage_path, uploaded_by)
  on public.job_photos to authenticated;

create trigger audit_job_photos after insert or update or delete on public.job_photos
  for each row execute function app.audit_row_change('job_photo', 'id', 'organization_id');

-- Take a photo off the job. The person who added it can while they could
-- still add photos; dispatchers can while the job is open or filled. The
-- row and file stay, visible to QuickPro staff only.
create or replace function public.hide_job_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.job_photos;
  v_job public.jobs;
begin
  select * into v_photo from public.job_photos where id = p_photo_id for update;
  if v_photo.id is null or v_photo.hidden_at is not null
     or not (app.is_org_member(v_photo.organization_id) or app.is_admin() or app.worker_accepted_on_job(v_photo.job_id)) then
    raise exception 'Photo not found.' using errcode = 'P0002';
  end if;
  select * into v_job from public.jobs where id = v_photo.job_id;
  if not (
    app.is_admin()
    or (v_job.status in ('open', 'filled') and app.can_dispatch(v_photo.organization_id))
    or (v_photo.uploaded_by = auth.uid() and app.can_add_job_photo(v_photo.job_id))
  ) then
    raise exception 'You can''t remove this photo.' using errcode = 'P0001';
  end if;
  update public.job_photos set hidden_at = now(), hidden_by = auth.uid() where id = p_photo_id;
end;
$$;

revoke all on function app.can_add_job_photo(uuid) from public;
grant execute on function app.can_add_job_photo(uuid) to authenticated;
revoke all on function public.hide_job_photo(uuid) from public;
grant execute on function public.hide_job_photo(uuid) to authenticated;
