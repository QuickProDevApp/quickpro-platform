import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobPeople } from "@/components/app/job-people";
import { JobFacts, SiteFacts } from "@/components/app/job-summary";
import { JobStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { uuid } from "@/lib/schemas";
import { requireAdmin } from "@/server/auth/session";
import { getJob, getJobSite, listJobPeople, listMatchCandidates } from "@/server/data/jobs";
import { staffCancelAssignmentAction, staffCancelJobAction, staffOfferAction } from "../actions";

export const metadata: Metadata = { title: "Job" };

export default async function AdminJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const admin = await requireAdmin();
  const { jobId } = await params;
  if (!uuid.safeParse(jobId).success) notFound();
  const job = await getJob(admin.id, jobId);
  if (!job) notFound();
  const now = new Date();
  const canOffer = job.status === "open" && job.starts_at > now;
  const live = job.status === "open" || job.status === "filled";
  const [site, people, candidates] = await Promise.all([
    getJobSite(admin.id, job.id),
    listJobPeople(admin.id, job.id),
    canOffer ? listMatchCandidates(admin.id, job.id) : Promise.resolve([]),
  ]);
  const involved = new Set(people.map((p) => p.worker_user_id));

  return (
    <>
      <PageHeader
        back={{ href: "/app/admin/jobs", label: "Jobs" }}
        title={job.title}
        meta={<JobStatusBadge job={job} />}
        description={
          <>
            <Link href={`/app/admin/organizations/${job.organization_id}`} className="font-medium text-brand hover:underline">
              View business
            </Link>{" "}
            · {job.accepted_count} of {job.headcount} booked · {job.offered_count} offered
          </>
        }
      />
      {job.status === "cancelled" ? <FormMessage tone="bad">Cancelled: {job.cancel_reason}</FormMessage> : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {canOffer ? (
            <Card>
              <CardHeader
                title="Match a worker"
                description="Approved workers, those in the job's town and with the most matching skills first. The worker still has to accept."
              />
              <CardBody>
                {candidates.filter((c) => !involved.has(c.user_id)).length === 0 ? (
                  <EmptyState title="No other approved workers to offer this job to" />
                ) : (
                  <ul className="divide-y divide-line">
                    {candidates
                      .filter((c) => !involved.has(c.user_id))
                      .map((c) => (
                        <li key={c.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                          <div className="min-w-0">
                            <Link href={`/app/admin/workers/${c.user_id}`} className="font-medium hover:underline">
                              {c.full_name || "Unnamed worker"}
                            </Link>
                            <p className="text-xs text-muted">
                              {[c.headline, c.home_area_name, c.in_area ? "In the job's town" : null, `${c.matching_skills} matching skills`]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <ActionForm action={staffOfferAction.bind(null, job.id)} className="contents">
                            <input type="hidden" name="workerId" value={c.user_id} />
                            <SubmitButton size="sm" variant="secondary" pendingLabel="Offering…">
                              Offer
                            </SubmitButton>
                          </ActionForm>
                        </li>
                      ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : null}
          <JobPeople
            people={people}
            canOffer={canOffer}
            canChange={live && job.ends_at > now}
            offerAction={staffOfferAction.bind(null, job.id)}
            cancelAction={staffCancelAssignmentAction.bind(null, job.id)}
          />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-4">
              <JobFacts job={job} />
              {job.description ? <p className="text-sm whitespace-pre-line text-ink-soft">{job.description}</p> : null}
            </CardBody>
          </Card>
          {site ? (
            <Card>
              <CardHeader title="On site" />
              <CardBody>
                <SiteFacts site={site} />
              </CardBody>
            </Card>
          ) : null}
          {live ? (
            <Card>
              <CardHeader title="Cancel job" description="Cancels every offer and booking. The business and workers see the reason." />
              <CardBody>
                <ActionForm action={staffCancelJobAction.bind(null, job.id)}>
                  <Input name="reason" placeholder="Reason" aria-label="Reason for cancelling" required maxLength={1000} />
                  <SubmitButton variant="danger" pendingLabel="Cancelling…">
                    Cancel job
                  </SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
