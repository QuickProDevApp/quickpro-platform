import { DocumentStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { DOCUMENT_TYPE_LABEL, formatBytes, formatDate, type DocumentType } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { QualificationDocument } from "@/server/data/documents";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function DocumentsPanel({
  documents,
  types,
  canEdit,
  uploadAction,
  deleteAction,
  intro,
}: {
  documents: QualificationDocument[];
  types: DocumentType[];
  canEdit: boolean;
  uploadAction: Action;
  deleteAction: Action;
  intro: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader title="Documents on file" description={intro} />
        <CardBody>
          {documents.length === 0 ? (
            <EmptyState title="No documents yet">Upload your first document with the form.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {documents.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{doc.title}</p>
                    <p className="text-sm text-muted">
                      {DOCUMENT_TYPE_LABEL[doc.doc_type]} · {formatBytes(doc.size_bytes)} · uploaded {formatDate(doc.created_at)}
                      {doc.expires_on ? ` · expires ${formatDate(doc.expires_on)}` : ""}
                    </p>
                    {doc.review_notes ? <p className="mt-1 text-sm text-ink-soft">Staff note: {doc.review_notes}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <DocumentStatusBadge status={doc.status} expiresOn={doc.expires_on} />
                    <a className="text-sm font-medium text-brand hover:underline" href={`/api/documents/${doc.id}`}>
                      View
                    </a>
                    {canEdit && doc.status !== "approved" ? (
                      <ActionForm action={deleteAction} className="" successMessage={false}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <SubmitButton variant="ghost" size="sm" pendingLabel="Deleting…">
                          Delete
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {canEdit ? (
        <Card className="self-start">
          <CardHeader title="Upload a document" description="PDF, JPEG or PNG, up to 10 MB." />
          <CardBody>
            <ActionForm action={uploadAction} resetOnSuccess>
              <Field name="docType" label="Document type">
                <Select name="docType" defaultValue={types[0]}>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {DOCUMENT_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field name="title" label="Title" hint="For example: 2026–2027 GL certificate, Hartford">
                <Input name="title" required maxLength={160} />
              </Field>
              <Field name="expiresOn" label="Expiration date" hint="Enter the policy or license expiration date if it has one.">
                <Input name="expiresOn" type="date" />
              </Field>
              <Field name="file" label="File">
                <Input name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="py-1.5" required />
              </Field>
              <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
