import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterLinks } from "@/components/app/filter-links";
import { JobStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { Table, TBody, Td, Th, THead, Tr, RowLink } from "@/components/ui/table";
import { formatCents, formatShift, shiftParts } from "@/lib/labels";
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
      <div className="flex flex-wrap items-start justify-between gap-3">
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
          <div className="p-4 sm:p-5">
            <EmptyState title={show === "upcoming" ? "No upcoming jobs" : "No jobs here yet"}>
              {canPost && show === "upcoming" ? "Post a job to find local workers for it." : null}
            </EmptyState>
          </div>
        ) : (
          <>
            {/* Phones: stacked rows. */}
            <ul className="divide-y divide-line md:hidden">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link href={`${base}/${j.id}`} className="block px-4 py-3.5 active:bg-subtle">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-medium text-ink">{j.title}</p>
                      <JobStatusBadge job={j} />
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {formatShift(j.starts_at, j.ends_at)} · {j.area_name}
                    </p>
                    <p className="tabular mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
                      <span>
                        {j.accepted_count}/{j.headcount} booked
                      </span>
                      <span>{formatCents(j.pay_rate_cents)}/hr</span>
                      {j.applicant_count > 0 ? (
                        <span className="font-medium text-brand">
                          {j.applicant_count} new {j.applicant_count === 1 ? "applicant" : "applicants"}
                        </span>
                      ) : null}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table label="Jobs">
                <THead>
                  <Th>Job</Th>
                  <Th>When</Th>
                  <Th align="right">Pay</Th>
                  <Th align="right">Booked</Th>
                  <Th>Applicants</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {jobs.map((j) => {
                    const when = shiftParts(j.starts_at, j.ends_at);
                    return (
                      <Tr key={j.id}>
                        <Td>
                          <RowLink href={`${base}/${j.id}`}>{j.title}</RowLink>
                          <p className="text-[13px] text-muted">{j.area_name}</p>
                        </Td>
                        <Td className="whitespace-nowrap">
                          <p className="text-ink">{when.day}</p>
                          <p className="text-[13px] text-muted">{when.time}</p>
                        </Td>
                        <Td align="right" className="tabular whitespace-nowrap text-ink">
                          {formatCents(j.pay_rate_cents)}
                          <span className="text-muted">/hr</span>
                        </Td>
                        <Td align="right" className="tabular whitespace-nowrap text-ink">
                          {j.accepted_count}
                          <span className="text-muted"> / {j.headcount}</span>
                        </Td>
                        <Td className="whitespace-nowrap">
                          {j.applicant_count > 0 ? (
                            <span className="tabular font-medium text-brand">{j.applicant_count} new</span>
                          ) : (
                            <span className="text-faint">None</span>
                          )}
                        </Td>
                        <Td>
                          <JobStatusBadge job={j} />
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
