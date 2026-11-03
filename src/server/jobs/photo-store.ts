import { createHash, randomUUID } from "node:crypto";
import type { DocumentDeps } from "@/server/documents/store";
import { validateDocument } from "@/server/files/validate";

// Job photos (D-035). Same guarantees as qualification documents: the row
// and the stored file end up both present or both absent. Kept free of
// Next.js and env imports so tests can inject a runner and storage.

export class PhotoRejected extends Error {}

export type PhotoInput = {
  jobId: string;
  checklistItemId: string | null;
  caption: string | null;
  fileName: string;
  bytes: Uint8Array;
};

/**
 * Validates the image (JPEG or PNG by its bytes, at most 10 MB), inserts the
 * row under row level security (which decides who may add photos), writes
 * the file in the same transaction, and removes the file again if anything
 * after the write fails.
 */
export async function storeJobPhoto(deps: DocumentDeps, userId: string, input: PhotoInput) {
  const checked = validateDocument(input.fileName, input.bytes);
  if (!checked.ok)
    throw new PhotoRejected(
      checked.error === "Upload a PDF, JPEG or PNG file." ? "Upload a JPEG or PNG photo." : checked.error,
    );
  const { file } = checked;
  if (file.mime === "application/pdf") throw new PhotoRejected("Upload a JPEG or PNG photo.");

  const id = randomUUID();
  const objectPath = `job/${input.jobId}/${id}.${file.extension}`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  let writeStarted = false;
  try {
    await deps.run(async (tx) => {
      // The organization comes from the job (a trigger sets it); this only satisfies the column.
      const inserted = await tx<{ id: string }[]>`
        insert into public.job_photos (id, job_id, organization_id, checklist_item_id, caption, file_name, mime_type,
                                       size_bytes, sha256, storage_path, uploaded_by)
        select ${id}, j.id, j.organization_id, ${input.checklistItemId}, ${input.caption}, ${file.fileName}, ${file.mime},
               ${file.size}, ${sha256}, ${objectPath}, ${userId}
        from public.jobs j where j.id = ${input.jobId}
        returning id
      `;
      if (!inserted.length) throw new PhotoRejected("Job not found.");
      writeStarted = true;
      await deps.storage.put(objectPath, input.bytes, file.mime);
    });
  } catch (error) {
    if (writeStarted) {
      try {
        await deps.storage.remove(objectPath);
      } catch (cleanup) {
        (
          deps.onCleanupFailure ??
          ((p, e) => console.error(`Could not remove storage object ${p}; run \`pnpm storage:reconcile\`.`, e))
        )(objectPath, cleanup);
      }
    }
    throw error;
  }
  return { id, objectPath };
}
