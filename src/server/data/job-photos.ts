import "server-only";
import { withUser } from "@/server/db/client";
import type { DocumentDeps } from "@/server/documents/store";
import { UserFacingError } from "@/server/errors";
import { PhotoRejected, storeJobPhoto, type PhotoInput } from "@/server/jobs/photo-store";
import { fileStorage } from "@/server/storage";

// Job photos (D-035). Row level security decides who sees and adds them;
// files are served only through /api/job-photos/<id>.

export type JobPhoto = {
  id: string;
  caption: string | null;
  checklist_item_id: string | null;
  checklist_label: string | null;
  uploaded_by: string | null;
  /** Shown to the business and staff; the crew see "You" or "Crew". */
  uploaded_by_name: string | null;
  created_at: Date;
  /** When a dispatcher shared it with the project's customer (D-036). */
  shared_at: Date | null;
};

/** A photo the contractor shared with the customer, as the project page shows it. */
export type SharedJobPhoto = {
  id: string;
  job_id: string;
  job_title: string;
  caption: string | null;
  checklist_label: string | null;
  created_at: Date;
  shared_at: Date;
};

export function listJobPhotos(userId: string, jobId: string) {
  return withUser(
    userId,
    (tx) => tx<JobPhoto[]>`
    select p.id, p.caption, p.checklist_item_id, i.label as checklist_label, p.uploaded_by,
           case when p.uploaded_by is not null and (app.is_org_member(p.organization_id) or app.is_admin())
                then coalesce((select pr.full_name from public.profiles pr where pr.id = p.uploaded_by),
                              (select x.full_name from public.job_people(p.job_id) x where x.worker_user_id = p.uploaded_by))
           end as uploaded_by_name,
           p.created_at, p.shared_at
    from public.job_photos p
    left join public.job_checklist_items i on i.id = p.checklist_item_id
    where p.job_id = ${jobId} and p.hidden_at is null
    order by p.created_at, p.id
  `,
  );
}

function depsFor(userId: string): DocumentDeps {
  return { run: (fn) => withUser(userId, fn), storage: fileStorage() };
}

export async function uploadJobPhoto(userId: string, input: PhotoInput) {
  try {
    const { id } = await storeJobPhoto(depsFor(userId), userId, input);
    return id;
  } catch (error) {
    if (error instanceof PhotoRejected) throw new UserFacingError(error.message);
    // Row level security refuses the insert for people who can't add photos now.
    if ((error as { code?: string }).code === "42501") {
      throw new UserFacingError("You can add photos once you've checked in, until two hours after the shift ends.");
    }
    throw error;
  }
}

export async function hideJobPhoto(userId: string, photoId: string) {
  await withUser(userId, (tx) => tx`select public.hide_job_photo(${photoId})`);
}

/**
 * The photo's file location, only if this user may see it: through row level
 * security (business, crew, staff), or as a photo shared on their project.
 */
export async function getJobPhotoForView(userId: string, photoId: string) {
  const [row] = await withUser(
    userId,
    (tx) => tx<{ storage_path: string; mime_type: string }[]>`
    select storage_path, mime_type from public.job_photos where id = ${photoId}
    union all
    select storage_path, mime_type from public.shared_job_photo_file(${photoId})
    limit 1
  `,
  );
  return row ?? null;
}

/** The customer's name if this user can share this job's photos with them, else null. */
export async function getPhotoSharing(userId: string, jobId: string) {
  const [row] = await withUser(
    userId,
    (tx) => tx<{ customer: string | null }[]>`select public.job_photo_sharing(${jobId}) as customer`,
  );
  return row?.customer ?? null;
}

export async function shareJobPhoto(userId: string, photoId: string, shared: boolean) {
  await withUser(userId, (tx) => tx`select public.share_job_photo(${photoId}, ${shared})`);
}

/** Photos shared on a customer project (customer, awarded contractor, staff). */
export function listSharedProjectPhotos(userId: string, requestId: string) {
  return withUser(
    userId,
    (tx) => tx<SharedJobPhoto[]>`select * from public.request_job_photos(${requestId})`,
  );
}
