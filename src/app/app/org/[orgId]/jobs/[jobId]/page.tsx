import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobPeople } from "@/components/app/job-people";
import { JobThread } from "@/components/app/job-thread";
import { JobFacts, SiteFacts } from "@/components/app/job-summary";
import { JobStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { requireMembership } from "@/server/actions/guards";
import { getJob, getJobSite, listJobPeople } from "@/server/data/jobs";
import { getJobThread } from "@/server/data/messages";
import { postJobMessageAction } from "@/app/app/messages/actions";
import { canDispatch } from "@/server/data/organizations";
import {
  cancelAssignmentAction,
  cancelJobAction,
  completeJobAction,
  declineApplicationAction,
  offerJobAction,
} from "../actions";

export const metadata: Metadata = { title: "Job" };

export default async function OrganizationJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; jobId: string }>;
  searchParams: Promise<{ posted?: string }>;
}) {
  const { orgId, jobId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (!uuid.safeParse(jobId).success) notFound();
  const job = await getJob(user.id, jobId);
  if (!job || job.organization_id !== org.id) notFound();
  const [site, people, messages] = await Promise.all([
    getJobSite(user.id, job.id),
    listJobPeople(user.id, job.id),
    getJobThread(user.id, job.id),
  ]);
  const posted = (await searchParams).posted === "1";

  const dispatcher = canDispatch(org.my_role);
  const now = new Date();
  const live = job.status === "open" || job.status === "filled";
  const canOffer = dispatcher && job.status === "open" && job.starts_at > now;
  const canChange = dispatcher && live && job.ends_at > now;
  const canComplete = dispatcher && live && job.starts_at <= now && job.accepted_count > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/app/org/${org.id}/jobs`} className="text-sm text-muted hover:text-ink">
            ← Jobs
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-ink">{job.title}</h2>
            <JobStatusBadge job={job} />
          </div>
          <p className="text-sm text-muted">
            {job.accepted_count} of {job.headcount} booked · {job.offered_count} offered · {job.applicant_count} new applicants
          </p>
        </div>
        {canChange ? (
          <LinkButton href={`/app/org/${org.id}/jobs/${job.id}/edit`} variant="secondary">
            Edit job
          </LinkButton>
        ) : null}
      </div>

      {posted ? (
        <FormMessage tone="ok">
          Job posted. Approved workers can now find it and apply. You&apos;ll get a QuickPro notification when someone
          applies; email and text alerts aren&apos;t available yet.
        </FormMessage>
      ) : null}
      {job.status === "cancelled" ? <FormMessage tone="bad">Cancelled: {job.cancel_reason}</FormMessage> : null}
      {job.status === "completed" ? <FormMessage tone="ok">Marked complete {formatDateTime(job.completed_at)}.</FormMessage> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <JobPeople
            people={people}
            canOffer={canOffer}
            canChange={canChange}
            offerAction={dispatcher ? offerJobAction.bind(null, org.id, job.id) : undefined}
            declineAction={dispatcher ? declineApplicationAction.bind(null, org.id, job.id) : undefined}
            cancelAction={dispatcher ? cancelAssignmentAction.bind(null, org.id, job.id) : undefined}
          />
          <JobThread
            messages={messages}
            currentUserId={user.id}
            postAction={postJobMessageAction.bind(null, job.id)}
            description="Your team, workers you offered the job to or booked, and QuickPro staff can read this."
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
              <CardHeader title="On site" description="Shared with booked workers only." />
              <CardBody>
                <SiteFacts site={site} />
              </CardBody>
            </Card>
          ) : null}
          {canComplete ? (
            <Card>
              <CardHeader title="Finish" description="Marks every booked worker's assignment complete. Unanswered offers lapse." />
              <CardBody>
                <ActionForm action={completeJobAction.bind(null, org.id, job.id)}>
                  <SubmitButton pendingLabel="Saving…">Mark job complete</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {dispatcher && live ? (
            <Card>
              <CardHeader title="Cancel job" description="Cancels every offer and booking. Workers see your reason." />
              <CardBody>
                <ActionForm action={cancelJobAction.bind(null, org.id, job.id)}>
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
    </div>
  );
}
