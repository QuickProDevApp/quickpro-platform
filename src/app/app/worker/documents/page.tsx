import type { Metadata } from "next";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { WORKER_DOCUMENT_TYPES } from "@/lib/labels";
import { requireUser } from "@/server/auth/session";
import { listDocuments } from "@/server/data/documents";
import { deleteWorkerDocumentAction, uploadWorkerDocumentAction } from "../actions";

export const metadata: Metadata = { title: "Certifications" };

export default async function WorkerDocumentsPage() {
  const user = await requireUser();
  const documents = await listDocuments(user.id, { kind: "worker", userId: user.id });
  return (
    <DocumentsPanel
      documents={documents}
      types={WORKER_DOCUMENT_TYPES}
      canEdit
      uploadAction={uploadWorkerDocumentAction}
      deleteAction={deleteWorkerDocumentAction}
      intro="Optional. Training certificates such as OSHA 10 or equipment certifications. Do not upload ID or Social Security documents."
    />
  );
}
