import Link from "next/link";
import { JobThread } from "@/components/app/job-thread";
import { DISPUTE_OUTCOME_LABEL, DISPUTE_REASON_LABEL, DisputeStatusBadge } from "@/components/app/trust";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatDate, formatDateTime } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { Dispute, DisputeMessage, DisputeWithViewer } from "@/server/data/disputes";
import type { ThreadMessage } from "@/server/data/messages";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const CONTEXT_LABEL = { project: "Project", subcontract: "Subcontract", shift: "Shift" } as const;

/** Dispute messages in the shape the shared thread renders. */
function asThread(messages: DisputeMessage[]): ThreadMessage[] {
  return messages.map((m) => ({
    id: m.id,
    author_id: m.author_id,
    author_name: m.author_name,
    author_side: m.author_side === "staff" ? "staff" : "business",
    organization_name: m.author_side === "staff" ? null : m.organization_name,
    body: m.body,
    created_at: m.created_at,
    hidden: false,
    hidden_reason: null,
  }));
}

/**
 * One dispute, for either side or QuickPro staff: what was raised, the
 * three-way thread, and the outcome once staff close it.
 */
export function DisputeView({
  dispute: d,
  messages,
  currentUserId,
  backHref,
  backLabel,
  workHref,
  opened,
  postAction,
  withdrawAction,
  resolveAction,
}: {
  dispute: DisputeWithViewer;
  messages: DisputeMessage[];
  currentUserId: string;
  backHref: string;
  backLabel: string;
  workHref?: string;
  /** Just raised: show the confirmation. */
  opened?: boolean;
  postAction?: Action;
  withdrawAction?: Action;
  resolveAction?: Action;
}) {
  const open = d.status === "open";
  const other = d.viewer_side === "opener" ? d.respondent_name : d.viewer_side === "respondent" ? d.opener_name : null;
  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-muted hover:text-ink">
          ← {backLabel}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">{DISPUTE_REASON_LABEL[d.reason]}</h2>
          <DisputeStatusBadge status={d.status} />
        </div>
        <p className="text-sm text-muted">
          {CONTEXT_LABEL[d.context]}:{" "}
          {workHref ? (
            <Link href={workHref} className="text-ink-soft hover:text-ink hover:underline">
              {d.title}
            </Link>
          ) : (
            d.title
          )}{" "}
          · raised by {d.viewer_side === "opener" ? "you" : d.opener_name} {formatDate(d.created_at)}
        </p>
      </div>

      {opened && open ? (
        <FormMessage tone="ok">
          Dispute raised. {d.respondent_name} and QuickPro staff got a notification and can reply below. Email and text
          alerts aren&apos;t available yet.
        </FormMessage>
      ) : null}

      {d.status === "resolved" && d.outcome ? (
        <Card className="border-ok/40">
          <CardHeader title={`Outcome: ${DISPUTE_OUTCOME_LABEL[d.outcome]}`} description={`Closed by QuickPro staff ${formatDateTime(d.resolved_at)}.`} />
          <CardBody>
            <p className="text-sm whitespace-pre-line text-ink-soft" data-testid="dispute-resolution">
              {d.resolution}
            </p>
          </CardBody>
        </Card>
      ) : d.status === "withdrawn" ? (
        <FormMessage tone="info">
          Withdrawn by {d.viewer_side === "opener" ? "you" : d.opener_name} {formatDateTime(d.withdrawn_at)}
          {d.withdraw_note ? `: “${d.withdraw_note}”` : "."}
        </FormMessage>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="What was raised" />
            <CardBody className="space-y-4">
              <p className="text-sm whitespace-pre-line text-ink" data-testid="dispute-summary">
                {d.summary}
              </p>
              {d.desired_outcome ? (
                <div className="border-t border-line pt-4">
                  <p className="text-xs font-medium tracking-wide text-faint uppercase">Asking for</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{d.desired_outcome}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>
          <JobThread
            title="Discussion"
            messages={asThread(messages)}
            currentUserId={currentUserId}
            postAction={open ? postAction : undefined}
            description={
              d.viewer_side === "staff"
                ? `${d.opener_name}, ${d.respondent_name} and QuickPro staff read this thread.`
                : `You, ${other} and QuickPro staff read this thread. Everyone on it gets a QuickPro notification.`
            }
            placeholder="Facts, dates, what would settle it…"
          />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Fact label="Raised by">{d.opener_name}</Fact>
                <Fact label="About">{d.respondent_name}</Fact>
                <Fact label="Raised">{formatDateTime(d.created_at)}</Fact>
                <Fact label="Last activity">{formatDateTime(d.last_activity_at)}</Fact>
              </dl>
            </CardBody>
          </Card>
          {open && d.viewer_side !== "staff" ? (
            <Card>
              <CardHeader title="How this works" />
              <CardBody className="space-y-2 text-[13px] text-ink-soft">
                <p>Both sides and QuickPro staff discuss it here. Many disputes are settled in the thread.</p>
                <p>
                  Staff then record an outcome that both sides see. QuickPro doesn&apos;t hold or move money yet, so any
                  refund, return visit or pay correction is arranged between the two businesses or with the worker.
                </p>
              </CardBody>
            </Card>
          ) : null}
          {resolveAction && open ? (
            <Card>
              <CardHeader title="Close with an outcome" description="Both sides are notified and see your note." />
              <CardBody>
                <ActionForm action={resolveAction} className="space-y-4">
                  <Field name="outcome" id="resolve-outcome" label="Outcome">
                    <Select name="outcome" id="resolve-outcome" required defaultValue="">
                      <option value="" disabled>
                        Choose one
                      </option>
                      {Object.entries(DISPUTE_OUTCOME_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field name="resolution" id="resolve-note" label="What was decided, and why">
                    <Textarea name="resolution" id="resolve-note" rows={4} minLength={10} maxLength={2000} required />
                  </Field>
                  <SubmitButton pendingLabel="Closing…">Close dispute</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {withdrawAction && open && d.viewer_side === "opener" ? (
            <details className="rounded-lg border border-line bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink sm:px-5">
                Withdraw this dispute…
              </summary>
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <ActionForm action={withdrawAction} className="space-y-3">
                  <Field name="note" id="withdraw-note" label="Note" hint={`Optional. ${d.respondent_name} and staff see it.`}>
                    <Textarea name="note" id="withdraw-note" rows={2} maxLength={1000} />
                  </Field>
                  <SubmitButton variant="secondary" pendingLabel="Withdrawing…">
                    Withdraw dispute
                  </SubmitButton>
                </ActionForm>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

/** A list of disputes linking to each one. */
export function DisputeList({
  disputes,
  href,
  viewer,
  emptyText,
}: {
  disputes: Dispute[];
  href: (d: Dispute) => string;
  /** Who is looking: a business (by id), the signed-in worker, or staff. */
  viewer: { orgId: string } | "worker" | "staff";
  emptyText: string;
}) {
  if (!disputes.length) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No disputes">{emptyText}</EmptyState>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-line">
        {disputes.map((d) => {
          const raisedByUs =
            viewer === "worker" ? d.opener_side === "worker" : viewer !== "staff" && d.opener_org_id === viewer.orgId;
          const counterpart =
            viewer === "staff"
              ? `${d.opener_name} about ${d.respondent_name}`
              : raisedByUs
                ? `Raised by you about ${d.respondent_name}`
                : `Raised by ${d.opener_name}`;
          return (
            <li key={d.id}>
              <Link href={href(d)} className="block px-4 py-3.5 hover:bg-subtle/60 sm:px-5" data-testid="dispute-row">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{DISPUTE_REASON_LABEL[d.reason]}</p>
                    <p className="truncate text-[13px] text-ink-soft">
                      {CONTEXT_LABEL[d.context]}: {d.title}
                    </p>
                    <p className="text-[13px] text-muted">
                      {counterpart} · {formatDate(d.created_at)}
                      {d.message_count ? ` · ${d.message_count} ${d.message_count === 1 ? "message" : "messages"}` : ""}
                    </p>
                  </div>
                  <DisputeStatusBadge status={d.status} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
