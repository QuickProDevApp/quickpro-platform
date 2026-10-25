import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { withUser } from "@/server/db/client";
import { UserFacingError } from "@/server/errors";
import { validateDocument } from "@/server/files/validate";
import { fileStorage } from "@/server/storage";
import type { DocumentStatus, DocumentType } from "@/lib/labels";

export type QualificationDocument = {
  id: string;
  organization_id: string | null;
  worker_user_id: string | null;
  doc_type: DocumentType;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  expires_on: string | null;
  status: DocumentStatus;
  review_notes: string | null;
  reviewed_at: Date | null;
  created_at: Date;
};

export type DocumentOwner = { kind: "org"; orgId: string } | { kind: "worker"; userId: string };

const columns = (tx: Parameters<Parameters<typeof withUser>[1]>[0]) => tx`
  id, organization_id, worker_user_id, doc_type, title, file_name, mime_type, size_bytes,
  to_char(expires_on, 'YYYY-MM-DD') as expires_on, status, review_notes, reviewed_at, created_at
`;

export function listDocuments(userId: string, owner: DocumentOwner) {
  return withUser(userId, (tx) =>
    owner.kind === "org"
      ? tx<QualificationDocument[]>`
          select ${columns(tx)} from public.qualification_documents
          where organization_id = ${owner.orgId} order by created_at desc`
      : tx<QualificationDocument[]>`
          select ${columns(tx)} from public.qualification_documents
          where worker_user_id = ${owner.userId} order by created_at desc`,
  );
}

export type UploadInput = {
  docType: DocumentType;
  title: string;
  expiresOn: string | null;
  fileName: string;
  bytes: Uint8Array;
};

/**
 * Validates the file by content, records it under row level security, then
 * writes it to private storage inside the same transaction, so a failed upload
 * leaves no row behind and a refused row never reaches storage.
 */
export async function uploadDocument(userId: string, owner: DocumentOwner, input: UploadInput) {
  const checked = validateDocument(input.fileName, input.bytes);
  if (!checked.ok) throw new UserFacingError(checked.error);
  const { file } = checked;

  const id = randomUUID();
  const ownerId = owner.kind === "org" ? owner.orgId : owner.userId;
  const storagePath = `${owner.kind}/${ownerId}/${id}.${file.extension}`;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");

  await withUser(userId, async (tx) => {
    await tx`
      insert into public.qualification_documents (
        id, organization_id, worker_user_id, doc_type, title, file_name, mime_type,
        size_bytes, sha256, storage_path, expires_on, uploaded_by
      ) values (
        ${id},
        ${owner.kind === "org" ? owner.orgId : null},
        ${owner.kind === "worker" ? owner.userId : null},
        ${input.docType}, ${input.title}, ${file.fileName}, ${file.mime},
        ${file.size}, ${sha256}, ${storagePath}, ${input.expiresOn}, ${userId}
      )
    `;
    await fileStorage().put(storagePath, input.bytes, file.mime);
  });
  return id;
}

export async function deleteDocument(userId: string, documentId: string) {
  const rows = await withUser(userId, (tx) => tx<{ storage_path: string }[]>`
    delete from public.qualification_documents where id = ${documentId} returning storage_path
  `);
  if (rows.length === 0) {
    throw new UserFacingError("That document can't be deleted. Approved documents stay on file.");
  }
  try {
    await fileStorage().remove(rows[0].storage_path);
  } catch (error) {
    // The record is gone, so the file is unreachable; log it for cleanup.
    console.error("Orphaned document file", rows[0].storage_path, error);
  }
}

/** Returns the document only if row level security lets this user read it. */
export async function getDocumentForDownload(userId: string, documentId: string) {
  const rows = await withUser(userId, (tx) => tx<{ storage_path: string; mime_type: string; file_name: string }[]>`
    select storage_path, mime_type, file_name from public.qualification_documents where id = ${documentId}
  `);
  return rows[0] ?? null;
}
