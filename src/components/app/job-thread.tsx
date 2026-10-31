import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import type { FormState } from "@/lib/schemas";
import type { ThreadMessage } from "@/server/data/messages";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const timeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

const SIDE_LABEL: Record<ThreadMessage["author_side"], string> = {
  business: "Business",
  worker: "Worker",
  staff: "QuickPro staff",
  former: "No longer on this job",
};

/**
 * A job's message thread: the business, workers offered or booked, and staff.
 * People get an in-app notification for new messages; nothing is emailed.
 */
export function JobThread({
  messages,
  currentUserId,
  postAction,
  hideAction,
  description,
}: {
  messages: ThreadMessage[];
  currentUserId: string;
  postAction?: Action;
  hideAction?: Action;
  description: string;
}) {
  return (
    <Card>
      <CardHeader title="Messages" description={description} />
      <CardBody className="space-y-4">
        {messages.length === 0 ? (
          <EmptyState title="No messages yet" />
        ) : (
          <ol className="space-y-3" aria-label="Messages">
            {messages.map((m) => {
              const mine = m.author_id === currentUserId;
              return (
                <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid="message">
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      m.hidden && !m.body
                        ? "border border-dashed border-line-strong text-muted"
                        : mine
                          ? "bg-brand text-white"
                          : "bg-canvas text-ink"
                    }`}
                  >
                    <p className={`text-xs ${mine && !(m.hidden && !m.body) ? "text-blue-100" : "text-muted"}`}>
                      {mine ? "You" : m.author_name} · {SIDE_LABEL[m.author_side]} · {timeFormat.format(m.created_at)}
                    </p>
                    {m.body !== null ? (
                      <p className="mt-0.5 whitespace-pre-line break-words">{m.body}</p>
                    ) : (
                      <p className="mt-0.5 italic">Removed by QuickPro staff.</p>
                    )}
                    {m.hidden && m.body !== null ? (
                      <p className="mt-1 text-xs font-medium text-bad">Hidden from others: {m.hidden_reason}</p>
                    ) : null}
                    {hideAction && !m.hidden ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted hover:text-ink">Hide…</summary>
                        <ActionForm action={hideAction} className="mt-2 space-y-2">
                          <input type="hidden" name="messageId" value={m.id} />
                          <Input name="reason" aria-label="Reason for hiding" placeholder="Reason (kept in the audit log)" maxLength={500} />
                          <SubmitButton variant="danger" size="sm" pendingLabel="Hiding…">Hide message</SubmitButton>
                        </ActionForm>
                      </details>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {postAction ? (
          <ActionForm action={postAction} resetOnSuccess successMessage={false}>
            <Field name="body" label="New message">
              <Textarea name="body" rows={3} maxLength={2000} placeholder="Parking, gear, timing…" />
            </Field>
            <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
          </ActionForm>
        ) : null}
      </CardBody>
    </Card>
  );
}
