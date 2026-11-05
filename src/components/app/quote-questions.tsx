import { ThreadBody } from "@/components/app/job-thread";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { ThreadMessage } from "@/server/data/messages";
import type { QuoteThreadSummary } from "@/server/data/requests";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * The customer's private threads with contractors before the award (D-041):
 * one per contractor, newest first, open when the contractor is waiting for
 * a reply. Each contractor sees only its own.
 */
export function CustomerQuoteQuestions({
  threads,
  currentUserId,
  open,
  replyAction,
  askAction,
  askable,
}: {
  threads: (QuoteThreadSummary & { messages: ThreadMessage[] })[];
  currentUserId: string;
  /** The request is still taking quotes. */
  open: boolean;
  /** Replying in a contractor's thread, when the user may. */
  replyAction?: (contractorId: string) => Action;
  /** Starting a thread with a contractor that quoted or was invited. */
  askAction?: Action;
  askable: { id: string; name: string }[];
}) {
  return (
    <Card>
      <CardHeader
        title={`Questions${threads.length ? ` (${threads.length})` : ""}`}
        description={
          open
            ? "Private between you and each contractor. Other contractors never see these. Questions close when you accept a quote."
            : "Closed when the request was awarded or cancelled. Kept for your records."
        }
      />
      {threads.length ? (
        <ul className="divide-y divide-line border-t border-line" data-testid="quote-threads">
          {threads.map((t) => (
            <li key={t.contractor_id} data-testid="quote-thread">
              <details open={open && t.awaiting_customer} className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-subtle sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{t.contractor_name}</span>
                    <span className="block text-xs text-muted">
                      {t.message_count} {t.message_count === 1 ? "message" : "messages"} · last {formatDateTime(t.last_message_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {open && t.awaiting_customer ? (
                      <Badge dot tone="warn">
                        Waiting for your reply
                      </Badge>
                    ) : null}
                    {t.quote_status === "submitted" ? <Badge tone="info">Quoted</Badge> : null}
                    <span aria-hidden className="text-muted transition-transform group-open:rotate-90">
                      ›
                    </span>
                  </span>
                </summary>
                <div className="space-y-4 px-4 pt-1 pb-4 sm:px-5">
                  <ThreadBody
                    messages={t.messages}
                    currentUserId={currentUserId}
                    postAction={open && replyAction ? replyAction(t.contractor_id) : undefined}
                    placeholder="Your answer…"
                    fieldId={`reply-${t.contractor_id}`}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
      {open && askAction && askable.length ? (
        <CardBody className={threads.length ? "border-t border-line" : ""}>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand hover:underline">
              Ask a contractor a question…
            </summary>
            <ActionForm action={askAction} resetOnSuccess className="mt-3 space-y-3">
              <Field name="contractorId" id="ask-contractor" label="Contractor">
                <Select id="ask-contractor" name="contractorId" defaultValue="" required>
                  <option value="" disabled>
                    Choose one
                  </option>
                  {askable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field name="body" id="ask-body" label="Question">
                <Textarea id="ask-body" name="body" rows={3} maxLength={2000} required placeholder="About their quote, timing, crew…" />
              </Field>
              <SubmitButton pendingLabel="Sending…">Send question</SubmitButton>
            </ActionForm>
          </details>
        </CardBody>
      ) : null}
      {!threads.length && !(open && askAction && askable.length) ? (
        <CardBody>
          <p className="text-sm text-muted">
            {open
              ? "Contractors who can see this request can ask you about it here before quoting."
              : "No questions were asked."}
          </p>
        </CardBody>
      ) : null}
    </Card>
  );
}
