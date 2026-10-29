import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import type { Tx } from "@/server/db/rls";
import { validateDocument } from "@/server/files/validate";
import type { FileStorage } from "@/server/storage/types";
import type { DocumentType } from "@/lib/labels";

// Kept free of Next.js and env imports so integration tests can inject a
// transaction runner and a storage implementation (including failing ones).

export class DocumentRejected extends Error {}

export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

export type DocumentDeps = {
  /** Runs `fn` in one transaction as the acting user (see withUser). */
  run: TxRunner;
  storage: FileStorage;
  onCleanupFailure?: (objectPath: string, error: unknown) => void;
};

export type DocumentOwner = { kind: "org"; orgId: string } | { kind: "worker"; userId: string };

export type UploadInput = {
  docType: DocumentType;
  title: string;
  expiresOn: string | null;
  fileName: string;
  bytes: Uint8Array;
};

const logCleanupFailure = (objectPath: string, error: unknown) =>
  console.error(`Could not remove storage object ${objectPath}; run \`pnpm storage:reconcile\`.`, error);

async function removeQuietly(deps: DocumentDeps, objectPath: string) {
  try {
    await deps.storage.remove(objectPath);
    return true;
  } catch (error) {
    (deps.onCleanupFailure ?? logCleanupFailure)(objectPath, error);
    return false;
  }
}

/**
 * Stores a document so that the database row and the storage object end up
 * either both present or both absent:
 *
 *   1. validate the bytes (size, file signature)
 *   2. in one transaction: insert the row under RLS, then write the object
 *   3. commit
 *
 * If the insert is refused, nothing is written. If the write fails, the
 * transaction rolls back. If anything fails after the write started
 * (including the commit itself), the object is removed again. If that
 * removal also fails, the object is an orphan with no row: nothing can reach
 * it, and `pnpm storage:reconcile` deletes it later.
 */
export async function storeDocument(deps: DocumentDeps, userId: string, owner: DocumentOwner, input: UploadInput) {
  const checked = validateDocument(input.fileName, input.bytes);
  if (!checked.ok) throw new DocumentRejected(checked.error);
  const { file } = checked;

  const id = randomUUID();
  const ownerId = owner.kind === "org" ? owner.orgId : owner.userId;
  const objectPath = `${owner.kind}/${ownerId}/${id}.${file.extension}`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  let writeStarted = false;
  try {
    await deps.run(async (tx) => {
      await tx`
        insert into public.qualification_documents (
          id, organization_id, worker_user_id, doc_type, title, file_name, mime_type,
          size_bytes, sha256, storage_path, expires_on, uploaded_by
        ) values (
          ${id},
          ${owner.kind === "org" ? owner.orgId : null},
          ${owner.kind === "worker" ? owner.userId : null},
          ${input.docType}, ${input.title}, ${file.fileName}, ${file.mime},
          ${file.size}, ${sha256}, ${objectPath}, ${input.expiresOn}, ${userId}
        )
      `;
      writeStarted = true;
      await deps.storage.put(objectPath, input.bytes, file.mime);
    });
  } catch (error) {
    if (writeStarted) await removeQuietly(deps, objectPath);
    throw error;
  }
  return { id, objectPath };
}

/**
 * Deletes the row first (under RLS, so only allowed deletions happen), then
 * the object. A failed object delete leaves an unreachable orphan for
 * reconciliation; it never leaves a row pointing at a missing file.
 */
export async function deleteStoredDocument(deps: DocumentDeps, documentId: string) {
  const rows = await deps.run((tx) => tx<{ storage_path: string }[]>`
    delete from public.qualification_documents where id = ${documentId} returning storage_path
  `);
  if (rows.length === 0) return { deleted: false, fileRemoved: false };
  const fileRemoved = await removeQuietly(deps, rows[0].storage_path);
  return { deleted: true, fileRemoved };
}

export type ReconcileReport = {
  orphanedObjects: string[];
  removedObjects: string[];
  failedRemovals: string[];
  rowsMissingObjects: { id: string; storage_path: string }[];
};

/**
 * Compares storage with qualification_documents. Needs a privileged database
 * connection (it reads every row). Objects with no row that are older than
 * the grace period are removed; younger ones may belong to an upload whose
 * transaction has not committed yet. Rows whose object is missing are
 * reported for staff follow-up, never deleted automatically.
 */
export async function reconcileStorage(
  sql: Sql,
  storage: FileStorage,
  { graceMinutes = 60, dryRun = false, now = new Date() } = {},
): Promise<ReconcileReport> {
  const objects = [...(await storage.list("org")), ...(await storage.list("worker"))];
  const rows = await sql<{ id: string; storage_path: string }[]>`
    select id, storage_path from public.qualification_documents
  `;
  const known = new Set(rows.map((r) => r.storage_path));
  const present = new Set(objects.map((o) => o.path));
  const cutoff = now.getTime() - graceMinutes * 60_000;

  const report: ReconcileReport = { orphanedObjects: [], removedObjects: [], failedRemovals: [], rowsMissingObjects: [] };
  for (const object of objects) {
    if (known.has(object.path)) continue;
    if (object.createdAt && object.createdAt.getTime() > cutoff) continue;
    report.orphanedObjects.push(object.path);
    if (dryRun) continue;
    try {
      await storage.remove(object.path);
      report.removedObjects.push(object.path);
    } catch {
      report.failedRemovals.push(object.path);
    }
  }
  report.rowsMissingObjects = rows.filter((r) => !present.has(r.storage_path));
  return report;
}
