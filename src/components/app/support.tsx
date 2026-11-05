import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import { SUPPORT_TOPICS, type FormState } from "@/lib/schemas";
import type { SupportMessage, SupportPriority, SupportStatus, SupportTicket, SupportTopic } from "@/server/data/support";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export const SUPPORT_TOPIC_LABEL: Record<SupportTopic, string> = {
  account: "Account and sign-in",
  verification: "Verification and documents",
  jobs: "Jobs and shifts",
  projects: "Projects and quotes",
  billing: "Invoices and payments",
  safety: "Safety on a job",
  technical: "Something isn't working",
  other: "Something else",
};

export function SupportStatusBadge({ status, viewer }: { status: SupportStatus; viewer: "requester" | "staff" }) {
  if (status === "resolved") return <Badge tone="ok">Resolved</Badge>;
  if (status === "waiting")
    return (
      <Badge tone={viewer === "requester" ? "warn" : "neutral"} dot>
        {viewer === "requester" ? "Waiting on you" : "Waiting on requester"}
      </Badge>
    );
  return (
    <Badge tone="info" dot>
      {viewer === "requester" ? "With QuickPro" : "Needs a reply"}
    </Badge>
  );
}

export function SupportPriorityBadge({ priority }: { priority: SupportPriority }) {
  if (priority === "urgent") return <Badge tone="bad">Urgent</Badge>;
  if (priority === "high") return <Badge tone="warn">High</Badge>;
  return null;
}

/** A list of requests, for the person or for staff. */
export function SupportList({
  tickets,
  href,
  viewer,
  emptyTitle,
  emptyText,
}: {
  tickets: SupportTicket[];
  href: (t: SupportTicket) => string;
  viewer: "requester" | "staff";
  emptyTitle: string;
  emptyText: string;
}) {
  if (!tickets.length) {
    return (
      <Card>
        <CardBody>
          <EmptyState title={emptyTitle}>{emptyText}</EmptyState>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-line">
        {tickets.map((t) => (
          <li key={t.id}>
            <Link href={href(t)} className="block px-4 py-3.5 hover:bg-subtle/60 sm:px-5" data-testid="support-row">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    <span className="tabular text-muted">#{t.ref}</span> {t.subject}
                  </span>
                  <span className="block text-[13px] text-muted">
                    {viewer === "staff" ? `${t.requester_name || t.requester_email || "Someone"}${t.organization_name ? ` · ${t.organization_name}` : ""} · ` : ""}
                    {SUPPORT_TOPIC_LABEL[t.topic]}
                  </span>
                  <span className="block text-[13px] text-faint">
                    {t.status === "resolved" && t.resolved_at
                      ? `Resolved ${formatDateTime(t.resolved_at)}`
                      : `${t.last_message_side === "staff" ? (viewer === "staff" ? "Staff replied" : "QuickPro replied") : viewer === "staff" ? "Last message" : "You wrote"} ${formatDateTime(t.last_message_at)}`}
                    {viewer === "staff" && t.assignee_name ? ` · ${t.assignee_name}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <SupportStatusBadge status={t.status} viewer={viewer} />
                  {viewer === "staff" ? <SupportPriorityBadge priority={t.priority} /> : null}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The conversation on a request. Staff see internal notes (marked), and
 * which staff member wrote each reply; the person sees "QuickPro support".
 */
export function SupportThread({ messages, viewer }: { messages: SupportMessage[]; viewer: "requester" | "staff" }) {
  return (
    <ol className="space-y-3" aria-label="Conversation">
      {messages.map((m) => {
        const fromRequester = m.author_side === "requester";
        const mine = viewer === "requester" ? fromRequester : !fromRequester;
        const who =
          viewer === "requester"
            ? fromRequester
              ? "You"
              : "QuickPro support"
            : fromRequester
              ? (m.author_name ?? "Requester")
              : `${m.author_name ?? "Staff"} · QuickPro`;
        return (
          <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={m.internal ? "internal-note" : "support-message"}>
            <div
              className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
                m.internal
                  ? "border border-dashed border-warn/40 bg-warn-soft text-ink"
                  : mine
                    ? "bg-charcoal text-white"
                    : "bg-canvas text-ink"
              }`}
            >
              <p className={`text-xs ${mine && !m.internal ? "text-white/70" : "text-muted"}`}>
                {m.internal ? <strong className="font-semibold text-warn">Internal note · </strong> : null}
                {who} · {formatDateTime(m.created_at)}
              </p>
              <p className="mt-0.5 whitespace-pre-line">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Asking for help: what it's about, which business, and what's going on. */
export function NewSupportRequestForm({
  action,
  organizations,
  defaultTopic,
}: {
  action: Action;
  organizations: { id: string; name: string }[];
  defaultTopic?: SupportTopic;
}) {
  return (
    <ActionForm action={action}>
      <Field name="topic" label="What is it about?">
        <Select name="topic" defaultValue={defaultTopic ?? ""} required>
          <option value="" disabled>
            Choose a topic
          </option>
          {SUPPORT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {SUPPORT_TOPIC_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      {organizations.length ? (
        <Field name="organizationId" label="Which business?" hint="Staff can then look at that business's account with you in mind.">
          <Select name="organizationId" defaultValue={organizations.length === 1 ? organizations[0].id : ""}>
            <option value="">Not about a business, just me</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field name="subject" label="Subject">
        <Input name="subject" maxLength={120} placeholder="For example: Insurance certificate rejected" required />
      </Field>
      <Field name="body" label="What's going on?" hint="Include job, project or invoice numbers if there are any. Don't include passwords or card numbers.">
        <Textarea name="body" rows={5} maxLength={4000} required />
      </Field>
      <SubmitButton pendingLabel="Sending…">Send to QuickPro support</SubmitButton>
    </ActionForm>
  );
}

/** The person's reply box. */
export function SupportReplyForm({ action, reopens }: { action: Action; reopens: boolean }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <Field name="body" id="support-reply" label={reopens ? "Reply to reopen this request" : "Your reply"}>
        <Textarea id="support-reply" name="body" rows={3} maxLength={4000} required />
      </Field>
      <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
    </ActionForm>
  );
}

/** Staff reply, or an internal note. */
export function StaffSupportReplyForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <Field name="body" id="staff-reply" label="Reply" hint="The requester gets a QuickPro notification.">
        <Textarea id="staff-reply" name="body" rows={4} maxLength={4000} required />
      </Field>
      <Checkbox name="internal" label="Internal note: only QuickPro staff will see it" />
      <SubmitButton pendingLabel="Sending…">Send</SubmitButton>
    </ActionForm>
  );
}

export function SupportCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}
