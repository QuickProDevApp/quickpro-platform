import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { DOCUMENT_TYPE_LABEL, INSURANCE_DOCUMENT_TYPES, formatDate, formatDateTime, type ReviewStatus } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { QualificationDocument } from "@/server/data/documents";
import { DocumentStatusBadge } from "@/components/ui/badge";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Decision buttons for the transitions the database allows from `status`. */
export function ReviewDecisionForm({ status, action }: { status: ReviewStatus; action: Action }) {
  if (status === "draft" || status === "rejected") {
    return <p className="text-sm text-muted">Nothing to review until the owner submits.</p>;
  }
  return (
    <ActionForm action={action}>
      <Field
        name="notes"
        label="Note to the owner"
        hint={status === "pending_review" ? "Required when requesting changes. The owner sees this note." : "Required. The owner sees this note."}
      >
        <Textarea name="notes" rows={3} maxLength={2000} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {status === "pending_review" ? (
          <>
            <SubmitButton name="decision" value="approved" pendingLabel="Saving…">
              Approve
            </SubmitButton>
            <SubmitButton name="decision" value="rejected" variant="secondary" pendingLabel="Saving…">
              Request changes
            </SubmitButton>
          </>
        ) : null}
        {status === "approved" ? (
          <SubmitButton name="decision" value="suspended" variant="danger" pendingLabel="Saving…">
            Suspend
          </SubmitButton>
        ) : null}
        {status === "suspended" ? (
          <SubmitButton name="decision" value="approved" pendingLabel="Saving…">
            Reinstate
          </SubmitButton>
        ) : null}
      </div>
    </ActionForm>
  );
}

export function AdminDocumentRow({ doc, action }: { doc: QualificationDocument; action: Action }) {
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{doc.title}</p>
          <p className="text-sm text-muted">
            {DOCUMENT_TYPE_LABEL[doc.doc_type]} · uploaded {formatDateTime(doc.created_at)}
            {doc.expires_on ? ` · expires ${formatDate(doc.expires_on)}` : " · no expiry given"}
          </p>
          {doc.review_notes ? <p className="mt-1 text-sm text-ink-soft">Note: {doc.review_notes}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <DocumentStatusBadge status={doc.status} expiresOn={doc.expires_on} />
          <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener" className="text-sm font-medium text-brand hover:underline">
            Open file
          </a>
        </div>
      </div>
      <details className="rounded-lg border border-line bg-canvas/60 px-3 py-2" open={doc.status === "pending"}>
        <summary className="cursor-pointer text-sm font-medium">{doc.status === "pending" ? "Review" : "Change review"}</summary>
        <div className="pt-3">
          <ActionForm action={action} className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <Field name="notes" label="Note">
              <Input name="notes" maxLength={2000} placeholder="e.g. Named insured matches; limits $1M/$2M" />
            </Field>
            <Field
              name="expiresOn"
              label="Expiration date"
              hint={INSURANCE_DOCUMENT_TYPES.includes(doc.doc_type) ? "Required to mark a certificate reviewed." : undefined}
            >
              <Input name="expiresOn" type="date" defaultValue={doc.expires_on ?? ""} />
            </Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <SubmitButton name="decision" value="approved" size="sm" pendingLabel="Saving…">
                Mark reviewed
              </SubmitButton>
              <SubmitButton name="decision" value="rejected" size="sm" variant="secondary" pendingLabel="Saving…">
                Not accepted
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
      </details>
    </li>
  );
}
