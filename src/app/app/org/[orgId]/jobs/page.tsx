import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterLinks } from "@/components/app/filter-links";
import { JobStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { formatCents, formatShift } from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";
import { listOrganizationJobs, type JobFilter } from "@/server/data/jobs";
import { canDispatch } from "@/server/data/organizations";

export const metadata: Metadata = { title: "Jobs" };

const FILTERS: JobFilter[] = ["upcoming", "past", "all"];

export default async function OrganizationJobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "contractor") notFound();
  const requested = (await searchParams).show;
  const show = FILTERS.find((f) => f === requested) ?? "upcoming";
  const jobs = await listOrganizationJobs(user.id, org.id, show);
  const dispatcher = canDispatch(org.my_role);
  const canPost = dispatcher && org.status === "approved";
  const base = `/app/org/${org.id}/jobs`;

  return (
    <div className="space-y-4">
      {org.status !== "approved" ? (
        <FormMessage tone="info">
          Your business can post jobs once QuickPro staff approve your registration.
        </FormMessage>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterLinks
          basePath={base}
          param="show"
          current={show === "upcoming" ? undefined : show}
          options={[
            { value: undefined, label: "Upcoming" },
            { value: "past", label: "Completed and cancelled" },
            { value: "all", label: "All" },
          ]}
        />
        {canPost ? <LinkButton href={`${base}/new`}>Post a job</LinkButton> : null}
      </div>
      <Card>
        {jobs.length === 0 ? (
          <div className="p-5">
            <EmptyState title={show === "upcoming" ? "No upcoming jobs" : "No jobs here yet"}>
              {canPost && show === "upcoming" ? "Post a job to find local workers for it." : null}
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={`${base}/${j.id}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{j.title}</p>
                    <p className="text-sm text-muted">
                      {formatShift(j.starts_at, j.ends_at)} · {j.area_name} · {formatCents(j.pay_rate_cents)}/hr
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-ink-soft tabular-nums">
                      {j.accepted_count}/{j.headcount} booked
                    </span>
                    {j.applicant_count > 0 ? (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                        {j.applicant_count} new {j.applicant_count === 1 ? "applicant" : "applicants"}
                      </span>
                    ) : null}
                    <JobStatusBadge job={j} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
