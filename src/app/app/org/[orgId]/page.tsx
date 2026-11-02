import { ReadinessList } from "@/components/app/readiness";
import { StatusBanner } from "@/components/app/status-banner";
import { DocumentStatusBadge, RequestStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  DOCUMENT_TYPE_LABEL,
  INSURANCE_STATUS_LABEL,
  formatCents,
  formatDate,
  formatDateRange,
  shiftParts,
  type InsuranceStatus,
} from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";
import { listOrganizationJobs, type Job } from "@/server/data/jobs";
import Link from "next/link";
import { JobStatusBadge } from "@/components/ui/badge";
import { listDocuments } from "@/server/data/documents";
import {
  canDispatch,
  canManage,
  getContractorCapabilities,
  getInsuranceStatus,
  getOrganizationReadiness,
} from "@/server/data/organizations";
import { listCategories, listServiceAreas } from "@/server/data/reference";
import {
  countOpenRequestsForContractor,
  listContractorRequests,
  listCustomerRequests,
  type ServiceRequest,
} from "@/server/data/requests";
import { submitOrganizationAction } from "./actions";

export default async function OrganizationOverview({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  const manager = canManage(org.my_role);
  const isContractor = org.kind === "contractor";

  const operating = isContractor && org.status === "approved";
  const [readiness, documents, caps, categories, areas, insurance, upcoming] = await Promise.all([
    getOrganizationReadiness(user.id, org),
    listDocuments(user.id, { kind: "org", orgId: org.id }),
    isContractor ? getContractorCapabilities(user.id, org.id) : null,
    isContractor ? listCategories(user.id) : [],
    isContractor ? listServiceAreas(user.id, org.market_id) : [],
    isContractor ? getInsuranceStatus(user.id, org.id) : null,
    operating ? listOrganizationJobs(user.id, org.id, "upcoming") : [],
  ]);
  const customerOperating = !isContractor && org.status === "approved";
  const [requests, openToQuote, won] = await Promise.all([
    customerOperating ? listCustomerRequests(user.id, org.id, "active") : Promise.resolve([]),
    operating ? countOpenRequestsForContractor(user.id, org.id) : Promise.resolve(0),
    operating ? listContractorRequests(user.id, org.id, "awarded") : Promise.resolve([]),
  ]);
  const activeProjects = won.filter((r) => r.status === "awarded");
  const canSubmit = manager && (org.status === "draft" || org.status === "rejected");
  const ready = readiness.every((i) => i.done);
  const subject = isContractor ? "business registration" : "organization registration";

  return (
    <div className="space-y-6">
      <StatusBanner
        status={org.status}
        notes={org.review_notes}
        submittedAt={org.submitted_at}
        subject={subject}
        rereviewReason={org.rereview_reason}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {canSubmit ? (
            <Card>
              <CardHeader
                title="Registration checklist"
                description="QuickPro staff review every registration before it can take part in the marketplace."
              />
              <CardBody className="space-y-4">
                <ReadinessList items={readiness} />
                <ActionForm action={submitOrganizationAction.bind(null, org.id)}>
                  <SubmitButton pendingLabel="Submitting…">Submit for review</SubmitButton>
                  {!ready ? (
                    <p className="text-xs text-muted">
                      Finish the items above first. We will tell you what is missing.
                    </p>
                  ) : null}
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {operating && openToQuote > 0 ? (
            <FormMessage tone="info">
              {openToQuote} customer {openToQuote === 1 ? "request matches" : "requests match"} your services and towns.{" "}
              <Link href={`/app/org/${org.id}/requests`} className="font-medium text-brand hover:underline">
                Review and quote
              </Link>
            </FormMessage>
          ) : null}
          {operating && activeProjects.length ? (
            <ContractorProjectsPanel orgId={org.id} projects={activeProjects} />
          ) : null}
          {operating ? (
            <Operations orgId={org.id} jobs={upcoming} canPost={canDispatch(org.my_role)} now={new Date().getTime()} />
          ) : customerOperating ? (
            <CustomerRequestsPanel orgId={org.id} requests={requests} canPost={canDispatch(org.my_role)} />
          ) : isContractor ? (
            <Card>
              <CardHeader title="What's next" />
              <CardBody className="text-sm text-ink-soft">
                <p>
                  Once approved, your business can quote on customer requests for the services and towns you list, and
                  post jobs for approved local workers to apply to.
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="What's next" />
              <CardBody className="text-sm text-ink-soft">
                <p>
                  Once QuickPro staff approve your organization, you can post service requests, invite approved local
                  contractors to quote, and compare their prices side by side.
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {caps ? (
            <Card>
              <CardHeader
                title="Services"
                action={
                  manager ? (
                    <LinkButton href={`/app/org/${org.id}/services`} variant="ghost" size="sm">
                      Edit
                    </LinkButton>
                  ) : null
                }
              />
              <CardBody className="space-y-3 text-sm">
                <TagList
                  empty="No categories yet"
                  items={categories.filter((c) => caps.categoryIds.includes(c.id)).map((c) => c.name)}
                />
                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Areas</p>
                  <TagList
                    empty="No areas yet"
                    items={areas.filter((a) => caps.areaIds.includes(a.id)).map((a) => a.name)}
                  />
                </div>
              </CardBody>
            </Card>
          ) : null}

          {insurance ? <InsuranceCard status={insurance} documentsHref={`/app/org/${org.id}/documents`} /> : null}

          <Card>
            <CardHeader
              title="Documents"
              action={
                <LinkButton href={`/app/org/${org.id}/documents`} variant="ghost" size="sm">
                  {manager ? "Manage" : "View"}
                </LinkButton>
              }
            />
            <CardBody>
              {documents.length === 0 ? (
                <EmptyState title="No documents uploaded" />
              ) : (
                <ul className="space-y-3">
                  {documents.slice(0, 5).map((d) => (
                    <li key={d.id} className="text-sm">
                      <p className="font-medium text-ink">{DOCUMENT_TYPE_LABEL[d.doc_type]}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <DocumentStatusBadge status={d.status} expiresOn={d.expires_on} />
                        {d.expires_on ? (
                          <span className="text-xs text-muted">Expires {formatDate(d.expires_on)}</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

const INSURANCE_TONE: Record<InsuranceStatus, "ok" | "info" | "bad" | "neutral"> = {
  current: "ok",
  pending_review: "info",
  expired: "bad",
  rejected: "bad",
  missing: "neutral",
};

function InsuranceCard({ status, documentsHref }: { status: InsuranceStatus; documentsHref: string }) {
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

function TagList({ items, empty }: { items: string[]; empty: string }) {
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
function Operations({ orgId, jobs, canPost, now }: { orgId: string; jobs: Job[]; canPost: boolean; now: number }) {
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
                <span className="tabular inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-navy px-1 text-xs font-semibold text-white">
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

function CustomerRequestsPanel({
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
function ContractorProjectsPanel({ orgId, projects }: { orgId: string; projects: ServiceRequest[] }) {
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
