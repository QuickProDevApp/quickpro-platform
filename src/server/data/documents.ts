import "server-only";
import { withUser } from "@/server/db/client";
import { DocumentRejected, deleteStoredDocument, storeDocument, type DocumentDeps, type DocumentOwner, type UploadInput } from "@/server/documents/store";
import { UserFacingError } from "@/server/errors";
import { fileStorage } from "@/server/storage";
import type { DocumentStatus, DocumentType } from "@/lib/labels";

export type { DocumentOwner } from "@/server/documents/store";

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

function depsFor(userId: string): DocumentDeps {
  return { run: (fn) => withUser(userId, fn), storage: fileStorage() };
}

export async function uploadDocument(userId: string, owner: DocumentOwner, input: UploadInput) {
  try {
    const { id } = await storeDocument(depsFor(userId), userId, owner, input);
    return id;
  } catch (error) {
    if (error instanceof DocumentRejected) throw new UserFacingError(error.message);
    throw error;
  }
}

export async function deleteDocument(userId: string, documentId: string) {
  const result = await deleteStoredDocument(depsFor(userId), documentId);
  if (!result.deleted) {
    throw new UserFacingError("That document can't be deleted. Approved documents stay on file.");
  }
}

/** Returns the document only if row level security lets this user read it. */
export async function getDocumentForDownload(userId: string, documentId: string) {
  const rows = await withUser(userId, (tx) => tx<{ storage_path: string; mime_type: string; file_name: string }[]>`
    select storage_path, mime_type, file_name from public.qualification_documents where id = ${documentId}
  `);
  return rows[0] ?? null;
}
