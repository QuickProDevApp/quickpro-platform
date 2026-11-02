import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatCents, formatDateTime } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { OrgSubcontract, Subcontract, SubcontractorOption, SubcontractStatus } from "@/server/data/subcontracts";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const STATUS: Record<SubcontractStatus, { label: string; tone: "info" | "ok" | "neutral" | "bad" | "warn" }> = {
  offered: { label: "Offer sent", tone: "info" },
  accepted: { label: "Working", tone: "ok" },
  completed: { label: "Part complete", tone: "ok" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Ended", tone: "neutral" },
};

export function SubcontractStatusBadge({ status, viewer = "prime" }: { status: SubcontractStatus; viewer?: "prime" | "sub" }) {
  const s = STATUS[status];
  return (
    <Badge tone={status === "offered" && viewer === "sub" ? "warn" : s.tone} dot={status === "accepted"}>
      {status === "offered" && viewer === "sub" ? "Awaiting your answer" : s.label}
    </Badge>
  );
}

/** One line on where a subcontract stands, for either business. */
export function subcontractSummary(s: Subcontract) {
  switch (s.status) {
    case "offered":
      return `Offered ${formatDateTime(s.offered_at)}`;
    case "accepted":
      return `Accepted ${formatDateTime(s.responded_at)}`;
    case "completed":
      return `Reported complete ${formatDateTime(s.completed_at)}`;
    case "declined":
      return `Declined ${formatDateTime(s.responded_at)}${s.response_note ? `: ${s.response_note}` : ""}`;
    case "cancelled":
      return `Ended ${formatDateTime(s.cancelled_at)}: ${s.cancel_reason ?? ""}`;
  }
}

/**
 * The prime contractor's subcontracts on a project, and the form to offer
 * part of the work to another approved contractor.
 */
export function PrimeSubcontracts({
  subcontracts,
  href,
  directory,
  offerAction,
  categoryName,
  description,
}: {
  subcontracts: Subcontract[];
  href: (s: Subcontract) => string;
  directory: SubcontractorOption[];
  /** Present while the project is in progress and the user dispatches. */
  offerAction?: Action;
  categoryName: string;
  description?: string;
}) {
  const live = subcontracts.filter((s) => s.status === "offered" || s.status === "accepted");
  const busy = new Set(live.map((s) => s.sub_id));
  const choices = directory.filter((d) => !busy.has(d.id));
  return (
    <Card>
      <CardHeader
        title="Subcontractors"
        description={
          description ??
          (subcontracts.length
            ? "Each subcontractor sees the project details, the site once they accept, and only their own jobs. Never your price with the customer."
            : undefined)
        }
      />
      {subcontracts.length ? (
        <ul className="divide-y divide-line border-b border-line">
          {subcontracts.map((s) => (
            <li key={s.id} className="px-4 py-3.5 sm:px-5" data-testid="subcontract-row">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <Link href={href(s)} className="font-medium text-ink hover:text-brand hover:underline">
                    {s.sub_name}
                  </Link>
                  <p className="text-[13px] text-muted">
                    {subcontractSummary(s)}
                    {s.amount_cents != null ? ` · ${formatCents(s.amount_cents)}` : ""}
                  </p>
                </div>
                <SubcontractStatusBadge status={s.status} />
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-soft">{s.scope}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {offerAction ? (
        <CardBody>
          {choices.length === 0 ? (
            <EmptyState title={directory.length ? "Every available business already has an offer" : "No other approved contractors yet"}>
              Subcontractors must be approved by QuickPro staff with a current, reviewed general liability certificate,
              in your market.
            </EmptyState>
          ) : (
            <details className="group">
              <summary className="inline-flex h-9 cursor-pointer items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-subtle">
                {subcontracts.length ? "Offer another part of the work…" : "Hand off part of the work…"}
              </summary>
              <ActionForm action={offerAction} className="mt-4 space-y-4" resetOnSuccess>
                <Field
                  name="subId"
                  label="Subcontractor"
                  hint={`Approved contractors with current insurance. Those listing ${categoryName.toLowerCase()} come first.`}
                >
                  <Select name="subId" required defaultValue="">
                    <option value="" disabled>
                      Choose a business
                    </option>
                    {choices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.serves_category ? "" : ` (doesn't list ${categoryName.toLowerCase()})`}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field name="scope" label="The part you're handing over" hint="What, where, and by when. They see this before accepting.">
                  <Textarea name="scope" required minLength={10} maxLength={2000} rows={3} />
                </Field>
                <Field
                  name="amount"
                  label="Agreed price (USD)"
                  hint="Optional, for your records. Only your two businesses see it. QuickPro doesn't process this payment yet."
                >
                  <Input name="amount" inputMode="decimal" placeholder="850" />
                </Field>
                <SubmitButton pendingLabel="Sending…">Send offer</SubmitButton>
              </ActionForm>
            </details>
          )}
        </CardBody>
      ) : subcontracts.length === 0 ? (
        <CardBody>
          <EmptyState title="No subcontractors on this project" />
        </CardBody>
      ) : null}
    </Card>
  );
}

/** For the customer: the businesses doing the work, without their prices. */
export function ProjectBusinesses({ primeName, subcontracts }: { primeName: string; subcontracts: Subcontract[] }) {
  if (subcontracts.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Who's on this project" description={`${primeName} manages the project and may bring in subcontractors.`} />
      <ul className="divide-y divide-line">
        <li className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <p className="min-w-0 font-medium text-ink">{primeName}</p>
          <Badge tone="info">Your contractor</Badge>
        </li>
        {subcontracts.map((s) => (
          <li key={s.id} className="px-4 py-3 sm:px-5" data-testid="project-business">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 font-medium text-ink">{s.sub_name}</p>
              <Badge tone={s.status === "completed" ? "ok" : "neutral"}>
                {s.status === "completed" ? "Part complete" : "Subcontractor"}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-3 text-[13px] text-ink-soft">{s.scope}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The scope and terms of one subcontract, as either business sees them. */
export function SubcontractTerms({ subcontract, viewer }: { subcontract: Subcontract; viewer: "prime" | "sub" }) {
  const s = subcontract;
  return (
    <Card>
      <CardHeader
        title={viewer === "sub" ? `Subcontract from ${s.prime_name}` : `Subcontract with ${s.sub_name}`}
        action={<SubcontractStatusBadge status={s.status} viewer={viewer} />}
        description={subcontractSummary(s)}
      />
      <CardBody className="space-y-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-faint uppercase">Scope</p>
          <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{s.scope}</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-3 text-sm">
          <div>
            <p className="text-xs font-medium tracking-wide text-faint uppercase">Agreed price</p>
            <p className="tabular mt-0.5 text-ink">{s.amount_cents != null ? formatCents(s.amount_cents) : "Not set"}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-faint uppercase">Offered</p>
            <p className="tabular mt-0.5 text-ink">{formatDateTime(s.offered_at)}</p>
          </div>
        </div>
        {s.response_note && s.status !== "declined" ? (
          <p className="border-t border-line pt-3 text-[13px] text-ink-soft">
            <span className="font-medium text-ink">{s.sub_name}:</span> “{s.response_note}”
          </p>
        ) : null}
        {s.completion_note ? (
          <p className="border-t border-line pt-3 text-[13px] text-ink-soft">
            <span className="font-medium text-ink">Completion note:</span> “{s.completion_note}”
          </p>
        ) : null}
        {s.amount_cents != null ? (
          <p className="border-t border-line pt-3 text-[13px] text-muted">
            The price is recorded for your two businesses. QuickPro doesn&apos;t invoice or pay subcontracts yet.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** "End this subcontract…" behind a disclosure, with a required reason. */
export function EndSubcontract({ action, otherName }: { action: Action; otherName: string }) {
  return (
    <details className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink sm:px-5">
        End this subcontract…
      </summary>
      <div className="space-y-3 border-t border-line px-4 py-4 sm:px-5">
        <p className="text-[13px] text-muted">
          {otherName} sees your reason. Any open jobs for this part must be completed or cancelled first.
        </p>
        <ActionForm action={action}>
          <Field name="reason" id="end-subcontract-reason" label="Reason">
            <Input name="reason" id="end-subcontract-reason" required maxLength={1000} />
          </Field>
          <SubmitButton variant="danger" pendingLabel="Ending…">
            End subcontract
          </SubmitButton>
        </ActionForm>
      </div>
    </details>
  );
}

/** Work a business took on from other contractors, for its requests page and overview. */
export function OrgSubcontractList({ orgId, items }: { orgId: string; items: OrgSubcontract[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((s) => (
        <li key={s.id}>
          <Link
            href={`/app/org/${orgId}/requests/${s.request_id}`}
            className="block px-4 py-3.5 hover:bg-subtle/60 active:bg-subtle sm:px-5"
            data-testid="subcontract-item"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 font-medium text-ink">{s.request_title}</p>
              <SubcontractStatusBadge status={s.status} viewer="sub" />
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              From {s.prime_name} · {s.customer_name} · {s.area_name}
              {s.amount_cents != null ? ` · ${formatCents(s.amount_cents)}` : ""}
            </p>
            <p className="mt-1 line-clamp-1 text-[13px] text-ink-soft">{s.scope}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
