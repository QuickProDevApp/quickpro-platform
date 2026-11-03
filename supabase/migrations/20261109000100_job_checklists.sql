-- Job checklists: the business lists what has to be done on a job, and the
-- booked crew check items off on the day once they've checked in. The
-- business sees who checked each item and when. Dispatchers can also check
-- items off (for example after a walk-through) until the job is completed.
--
-- Nothing here deletes or drops anything. Removing an item sets removed_at;
-- the row stays, so the record of what was asked for is kept.

create table public.job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  position int not null,
  label text not null check (char_length(btrim(label)) between 1 and 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  done_note text check (done_note is null or char_length(done_note) <= 500),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete set null,
  check (done_at is not null or (done_by is null and done_note is null))
);

create index job_checklist_items_job_idx on public.job_checklist_items (job_id, position);

alter table public.job_checklist_items enable row level security;

-- The business, staff, and workers booked on the job (accepted or worked).
create policy "business, staff and booked crew read checklists"
  on public.job_checklist_items for select to authenticated
  using (app.is_org_member(organization_id) or app.is_admin() or app.worker_accepted_on_job(job_id));
grant select on public.job_checklist_items to authenticated;

create trigger audit_job_checklist_items after insert or update or delete on public.job_checklist_items
  for each row execute function app.audit_row_change('job_checklist_item', 'id', 'organization_id');

-- Dispatchers add items while the job is open or filled. Up to 30 per job.
create or replace function public.add_job_checklist_item(p_job_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if v_job.id is null or not (app.is_org_member(v_job.organization_id) or app.is_admin()) then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;
  if not app.can_dispatch(v_job.organization_id) then
    raise exception 'Only owners, admins and dispatchers can change the checklist.' using errcode = 'P0001';
  end if;
  if v_job.status not in ('open', 'filled') then
    raise exception 'The checklist can''t change once the job is completed or cancelled.' using errcode = 'P0001';
  end if;
  if char_length(v_label) < 1 or char_length(v_label) > 200 then
    raise exception 'Describe the item in 1 to 200 characters.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.job_checklist_items where job_id = p_job_id and removed_at is null) >= 30 then
    raise exception 'A job can have up to 30 checklist items.' using errcode = 'P0001';
  end if;
  insert into public.job_checklist_items (job_id, organization_id, position, label, created_by)
  values (p_job_id, v_job.organization_id,
          coalesce((select max(position) from public.job_checklist_items where job_id = p_job_id), 0) + 1,
          v_label, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Dispatchers take an item off the list. It is kept, marked removed.
create or replace function public.remove_job_checklist_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.job_checklist_items;
  v_job public.jobs;
begin
  select * into v_item from public.job_checklist_items where id = p_item_id for update;
  if v_item.id is null or not (app.is_org_member(v_item.organization_id) or app.is_admin()) then
    raise exception 'Checklist item not found.' using errcode = 'P0002';
  end if;
  if not app.can_dispatch(v_item.organization_id) then
    raise exception 'Only owners, admins and dispatchers can change the checklist.' using errcode = 'P0001';
  end if;
  select * into v_job from public.jobs where id = v_item.job_id;
  if v_job.status not in ('open', 'filled') then
    raise exception 'The checklist can''t change once the job is completed or cancelled.' using errcode = 'P0001';
  end if;
  if v_item.removed_at is not null then
    return;
  end if;
  update public.job_checklist_items set removed_at = now(), removed_by = auth.uid() where id = p_item_id;
end;
$$;

-- Check an item off, or undo it. Booked crew can once they've checked in
-- and until the shift ends; dispatchers can until the job is completed.
-- When the crew check off the last item, the dispatchers are told (once).
create or replace function public.set_job_checklist_item_done(p_item_id uuid, p_done boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.job_checklist_items;
  v_job public.jobs;
  v_dispatcher boolean;
  v_crew boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_left int;
begin
  select * into v_item from public.job_checklist_items where id = p_item_id for update;
  if v_item.id is null
     or not (app.is_org_member(v_item.organization_id) or app.is_admin() or app.worker_accepted_on_job(v_item.job_id)) then
    raise exception 'Checklist item not found.' using errcode = 'P0002';
  end if;
  if v_item.removed_at is not null then
    raise exception 'That item was taken off the checklist.' using errcode = 'P0001';
  end if;
  select * into v_job from public.jobs where id = v_item.job_id;
  if v_job.status not in ('open', 'filled') then
    raise exception 'The checklist can''t change once the job is completed or cancelled.' using errcode = 'P0001';
  end if;
  v_dispatcher := app.can_dispatch(v_item.organization_id);
  v_crew := exists (
    select 1 from public.job_assignments
    where job_id = v_item.job_id and worker_user_id = auth.uid()
      and status = 'accepted' and checked_in_at is not null
  );
  if not v_dispatcher then
    if not v_crew then
      raise exception 'You can check items off once you''ve checked in.' using errcode = 'P0001';
    end if;
    if now() > v_job.ends_at + interval '2 hours' then
      raise exception 'This shift has ended. Ask the business to update the checklist.' using errcode = 'P0001';
    end if;
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the note to 500 characters.' using errcode = 'P0001';
  end if;

  if coalesce(p_done, false) then
    if v_item.done_at is not null then
      return;
    end if;
    update public.job_checklist_items
       set done_at = now(), done_by = auth.uid(), done_note = v_note
     where id = p_item_id;
    select count(*) into v_left from public.job_checklist_items
     where job_id = v_item.job_id and removed_at is null and done_at is null;
    -- Once per job: ticking an item off again after an undo doesn't repeat it.
    if v_left = 0 and not v_dispatcher
       and not exists (select 1 from public.notifications where job_id = v_item.job_id and kind = 'job.checklist_done') then
      perform app.notify_dispatchers(
        v_item.organization_id, 'job.checklist_done', 'Checklist complete: ' || v_job.title,
        'The crew checked off every item.', '/app/org/' || v_item.organization_id || '/jobs/' || v_item.job_id, v_item.job_id);
    end if;
  else
    update public.job_checklist_items set done_at = null, done_by = null, done_note = null where id = p_item_id;
  end if;
end;
$$;

revoke all on function public.add_job_checklist_item(uuid, text) from public;
revoke all on function public.remove_job_checklist_item(uuid) from public;
revoke all on function public.set_job_checklist_item_done(uuid, boolean, text) from public;
grant execute on function public.add_job_checklist_item(uuid, text) to authenticated;
grant execute on function public.remove_job_checklist_item(uuid) to authenticated;
grant execute on function public.set_job_checklist_item_done(uuid, boolean, text) to authenticated;
