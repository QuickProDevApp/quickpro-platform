import Link from "next/link";
import { Badge, JobStatusBadge, RequestStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import {
  INSURANCE_STATUS_LABEL,
  formatCents,
  formatDate,
  formatDateRange,
  shiftParts,
  type InsuranceStatus,
} from "@/lib/labels";
import type { InvoiceRow } from "@/server/data/invoices";
import type { Job } from "@/server/data/jobs";
import type { ServiceRequest } from "@/server/data/requests";

/*
 * Panels of the business overview, shared by the page and the presentation
 * preview (D-047). They only render what they are given.
 */

const INSURANCE_TONE: Record<InsuranceStatus, "ok" | "info" | "bad" | "neutral"> = {
  current: "ok",
  pending_review: "info",
  expired: "bad",
  rejected: "bad",
  missing: "neutral",
};

export function InsuranceCard({ status, documentsHref }: { status: InsuranceStatus; documentsHref: string }) {
  return (
    <Card>
      <CardHeader
        title="General liability insurance"
        action={<Badge tone={INSURANCE_TONE[status]}>{INSURANCE_STATUS_LABEL[status]}</Badge>}
      />
      <CardBody className="space-y-2 text-sm text-ink-soft">
        <p>
          QuickPro staff must review a current certificate before approving your business. Upload the renewal before
          this one expires; staff track expiring certificates. A staff review means a person checked the certificate you
          uploaded. QuickPro does not confirm coverage with your insurer.
        </p>
        {status !== "current" && status !== "pending_review" ? (
          <a href={documentsHref} className="font-medium text-brand hover:underline">
            Upload a current certificate
          </a>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function TagList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i} className="rounded-md bg-subtle px-2 py-1 text-xs text-ink-soft ring-1 ring-inset ring-line">
          {i}
        </li>
      ))}
    </ul>
  );
}

const DAY = 86_400_000;

/** What the dispatcher needs to act on, then the next jobs on the calendar. */
export function Operations({ orgId, jobs, canPost, now }: { orgId: string; jobs: Job[]; canPost: boolean; now: number }) {
  const base = `/app/org/${orgId}/jobs`;
  const unfilledSoon = jobs.filter((j) => j.status === "open" && j.starts_at.getTime() - now < 2 * DAY);
  const withApplicants = jobs.filter((j) => j.applicant_count > 0);
  const awaiting = jobs.filter((j) => j.offered_count > 0);
  const attention = [
    { label: "Open jobs starting within 48 hours", jobs: unfilledSoon },
    { label: "Jobs with new applicants", jobs: withApplicants },
    { label: "Jobs with offers waiting for an answer", jobs: awaiting },
  ].filter((a) => a.jobs.length > 0);
  const next = jobs.slice(0, 6);

  return (
    <Card>
      <CardHeader
        title="Operations"
        description={`${jobs.length} upcoming ${jobs.length === 1 ? "job" : "jobs"}`}
        action={
          canPost ? (
            <LinkButton href={`${base}/new`} size="sm">
              Post a job
            </LinkButton>
          ) : null
        }
      />
      {attention.length ? (
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <p className="text-xs font-medium text-muted">Needs attention</p>
          <ul className="mt-2 space-y-1.5">
            {attention.map((a) => (
              <li key={a.label} className="flex items-start gap-2 text-sm">
                <span className="tabular inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-charcoal px-1 text-xs font-semibold text-white">
                  {a.jobs.length}
                </span>
                <span className="text-ink">
                  {a.label}:{" "}
                  {a.jobs.slice(0, 3).map((j, i) => (
                    <span key={j.id}>
                      {i > 0 ? ", " : ""}
                      <Link href={`${base}/${j.id}`} className="text-brand hover:underline">
                        {j.title}
                      </Link>
                    </span>
                  ))}
                  {a.jobs.length > 3 ? ` and ${a.jobs.length - 3} more` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {next.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState title="No upcoming jobs">
            Post a job when you need extra hands. Approved local workers can find it and apply.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {next.map((j) => {
            const when = shiftParts(j.starts_at, j.ends_at);
            return (
              <li key={j.id}>
                <Link
                  href={`${base}/${j.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-subtle/60 sm:px-5"
                >
                  <div className="w-16 shrink-0 text-[13px] leading-5">
                    <p className="font-medium text-ink">{when.day.split(", ")[0]}</p>
                    <p className="text-muted">{when.day.split(", ")[1]}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{j.title}</p>
                    <p className="truncate text-[13px] text-muted">
                      {when.time} · {j.area_name}
                    </p>
                  </div>
                  <p className="tabular hidden text-[13px] text-ink-soft sm:block">
                    {j.accepted_count}/{j.headcount} booked
                  </p>
                  <JobStatusBadge job={j} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {jobs.length > next.length ? (
        <div className="border-t border-line px-4 py-2.5 sm:px-5">
          <Link href={base} className="text-sm font-medium text-brand hover:underline">
            All {jobs.length} upcoming jobs
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

/** Issued invoices addressed to this customer, oldest due first. */
export function InvoicesToPay({ orgId, invoices }: { orgId: string; invoices: InvoiceRow[] }) {
  const sorted = [...invoices].sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const total = sorted.reduce((n, i) => n + Number(i.total_cents), 0);
  return (
    <Card>
      <CardHeader
        title="Invoices to pay"
        description={`${sorted.length} ${sorted.length === 1 ? "invoice" : "invoices"} · ${formatCents(total)} due`}
        action={
          <Link href={`/app/org/${orgId}/invoices`} className="text-sm font-medium text-brand hover:underline">
            All invoices
          </Link>
        }
      />
      <ul className="divide-y divide-line" data-testid="invoices-to-pay">
        {sorted.slice(0, 4).map((i) => (
          <li key={i.id}>
            <Link
              href={`/app/org/${orgId}/invoices/${i.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-subtle/60 sm:px-5"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {i.number} · {i.title}
                </span>
                <span className="block text-[13px] text-muted">
                  From {i.issuer_name}
                  {i.due_date ? ` · due ${formatDate(i.due_date)}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {i.overdue ? (
                  <Badge dot tone="bad">
                    Overdue
                  </Badge>
                ) : null}
                <span className="tabular text-sm font-semibold text-ink">{formatCents(Number(i.total_cents))}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function CustomerRequestsPanel({
  orgId,
  requests,
  canPost,
}: {
  orgId: string;
  requests: ServiceRequest[];
  canPost: boolean;
}) {
  const base = `/app/org/${orgId}/requests`;
  const waiting = requests.reduce((n, r) => n + (r.status === "open" ? r.quote_count : 0), 0);
  const toConfirm = requests.filter((r) => r.status === "awarded" && r.work_completed_at);
  return (
    <Card>
      <CardHeader
        title="Service requests"
        description={
          requests.length
            ? `${requests.length} active · ${waiting} ${waiting === 1 ? "quote" : "quotes"} waiting for your decision`
            : undefined
        }
        action={
          canPost ? (
            <LinkButton href={`${base}/new`} size="sm">
              Request service
            </LinkButton>
          ) : null
        }
      />
      {toConfirm.length ? (
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <p className="text-xs font-medium text-muted">Needs your confirmation</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {toConfirm.map((r) => (
              <li key={r.id}>
                <Link href={`${base}/${r.id}`} className="text-brand hover:underline">
                  {r.title}
                </Link>
                <span className="text-muted"> · {r.awarded_contractor_name} reported the work complete</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {requests.length === 0 ? (
        <CardBody>
          <EmptyState title="No active requests">
            Describe the work and approved contractors who serve your town can send you quotes.
          </EmptyState>
        </CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {requests.slice(0, 6).map((r) => (
            <li key={r.id}>
              <Link
                href={`${base}/${r.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-subtle/60 sm:px-5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{r.title}</span>
                  <span className="block text-[13px] text-muted">
                    {formatDateRange(r.preferred_start, r.preferred_end)} ·{" "}
                    {r.awarded_contractor_name
                      ? `${r.awarded_contractor_name} · ${r.project_job_count} ${r.project_job_count === 1 ? "job" : "jobs"} scheduled`
                      : r.quote_count === 0
                        ? "No quotes yet"
                        : `${r.quote_count} ${r.quote_count === 1 ? "quote" : "quotes"}, from ${formatCents(r.lowest_quote_cents)}`}
                  </span>
                </span>
                <RequestStatusBadge status={r.status} workReported={!!r.work_completed_at} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Work this contractor won and is still delivering. */
export function subcontractSummaryLine(offers: number) {
  return offers
    ? `Work other contractors are handing to your business. ${offers} ${offers === 1 ? "offer is" : "offers are"} waiting for your answer.`
    : "Work other contractors handed to your business.";
}

export function ContractorProjectsPanel({ orgId, projects }: { orgId: string; projects: ServiceRequest[] }) {
  const base = `/app/org/${orgId}/requests`;
  return (
    <Card>
      <CardHeader
        title="Projects in progress"
        description={`${projects.length} awarded ${projects.length === 1 ? "project" : "projects"}`}
      />
      <ul className="divide-y divide-line">
        {projects.map((r) => (
          <li key={r.id}>
            <Link
              href={`${base}/${r.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-subtle/60 sm:px-5"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{r.title}</span>
                <span className="block text-[13px] text-muted">
                  {r.customer_name} · {formatCents(r.awarded_amount_cents)} ·{" "}
                  {r.project_job_count === 0
                    ? "No jobs scheduled yet"
                    : `${r.project_job_count} ${r.project_job_count === 1 ? "job" : "jobs"}`}
                </span>
              </span>
              <RequestStatusBadge status={r.status} workReported={!!r.work_completed_at} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
