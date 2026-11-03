import "server-only";
import { withUser } from "@/server/db/client";

// Job checklists (D-034). The business lists what has to be done; the booked
// crew check items off once they've checked in. Row level security decides
// who reads them; the database functions make every change.

export type ChecklistItem = {
  id: string;
  label: string;
  position: number;
  done_at: Date | null;
  /** Who checked it off. The name is shown to the business and staff only. */
  done_by: string | null;
  done_by_name: string | null;
  done_note: string | null;
};

/** The job's current checklist (items taken off are left out), in order. */
export function listJobChecklist(userId: string, jobId: string) {
  return withUser(
    userId,
    (tx) => tx<ChecklistItem[]>`
    select i.id, i.label, i.position, i.done_at, i.done_by,
           case when i.done_by is not null and (app.is_org_member(i.organization_id) or app.is_admin())
                then coalesce((select pr.full_name from public.profiles pr where pr.id = i.done_by),
                              (select p.full_name from public.job_people(i.job_id) p where p.worker_user_id = i.done_by))
           end as done_by_name,
           i.done_note
    from public.job_checklist_items i
    where i.job_id = ${jobId} and i.removed_at is null
    order by i.position
  `,
  );
}

export async function addJobChecklistItem(userId: string, jobId: string, label: string) {
  const [{ id }] = await withUser(
    userId,
    (tx) => tx<{ id: string }[]>`select public.add_job_checklist_item(${jobId}, ${label}) as id`,
  );
  return id;
}

export async function removeJobChecklistItem(userId: string, itemId: string) {
  await withUser(userId, (tx) => tx`select public.remove_job_checklist_item(${itemId})`);
}

export async function setJobChecklistItemDone(userId: string, itemId: string, done: boolean, note: string | null) {
  await withUser(userId, (tx) => tx`select public.set_job_checklist_item_done(${itemId}, ${done}, ${note})`);
}
