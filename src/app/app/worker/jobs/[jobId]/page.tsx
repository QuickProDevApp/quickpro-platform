import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobFacts, SiteFacts } from "@/components/app/job-summary";
import { ApplicationStatusBadge, AssignmentStatusBadge, JobStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { requireUser } from "@/server/auth/session";
import { getJobForWorker, getJobSite } from "@/server/data/jobs";
import { getWorkerProfile } from "@/server/data/workers";
import {
  applyAction,
  cancelMyAssignmentAction,
  checkInAction,
  checkOutAction,
  respondAction,
  withdrawAction,
} from "../actions";

export const metadata: Metadata = { title: "Job" };

const HOUR = 3_600_000;

export default async function WorkerJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const user = await requireUser();
  if (!uuid.safeParse(jobId).success) notFound();
  const [job, profile] = await Promise.all([getJobForWorker(user.id, jobId), getWorkerProfile(user.id)]);
  if (!job || !profile) notFound();
  const site = job.assignment_status === "accepted" || job.assignment_status === "completed" ? await getJobSite(user.id, job.id) : null;

  const now = new Date();
  const upcoming = job.status === "open" && job.starts_at > now;
  const canApply = upcoming && profile.status === "approved" && (!job.application_status || job.application_status === "withdrawn") && !job.assignment_status;
  const accepted = job.assignment_status === "accepted";
  const checkInOpen = accepted && !job.checked_in_at && now.getTime() >= job.starts_at.getTime() - HOUR && now < job.ends_at;

  return (
    <div className="space-y-6">
      <div>
        <Link href={job.application_status || job.assignment_status ? "/app/worker/my-jobs" : "/app/worker/jobs"} className="text-sm text-muted hover:text-ink">
          ← Back
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">{job.title}</h2>
          {job.status !== "open" ? <JobStatusBadge job={job} /> : null}
          {job.assignment_status ? (
            <AssignmentStatusBadge status={job.assignment_status} />
          ) : job.application_status ? (
            <ApplicationStatusBadge status={job.application_status} />
          ) : null}
        </div>
        <p className="text-sm text-muted">{job.organization_name ?? "A QuickPro contractor"}</p>
      </div>

      {job.status === "cancelled" ? <FormMessage tone="bad">The business cancelled this job: {job.cancel_reason}</FormMessage> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {job.assignment_status === "offered" && upcoming ? (
            <Card>
              <CardHeader title="You've been offered this job" description="Accepting books you for the whole shift. The address and on-site contact are shared once you accept." />
              <CardBody>
                <ActionForm action={respondAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="assignmentId" value={job.assignment_id!} />
                  <SubmitButton name="answer" value="accept" pendingLabel="Saving…">
                    Accept job
                  </SubmitButton>
                  <SubmitButton name="answer" value="decline" variant="secondary" pendingLabel="Saving…">
                    Decline
                  </SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {accepted || job.assignment_status === "completed" ? (
            <Card>
              <CardHeader title="On the day" />
              <CardBody className="space-y-4">
                {site ? <SiteFacts site={site} /> : null}
                <p className="text-sm text-ink-soft">
                  {job.checked_in_at ? `Checked in ${formatDateTime(job.checked_in_at)}.` : "Not checked in yet."}
                  {job.checked_out_at ? ` Checked out ${formatDateTime(job.checked_out_at)}.` : ""}
                </p>
                {checkInOpen ? (
                  <ActionForm action={checkInAction}>
                    <input type="hidden" name="assignmentId" value={job.assignment_id!} />
                    <SubmitButton pendingLabel="Checking in…">Check in</SubmitButton>
                  </ActionForm>
                ) : accepted && !job.checked_in_at && now < job.ends_at ? (
                  <p className="text-xs text-muted">Check-in opens an hour before the start time.</p>
                ) : null}
                {job.checked_in_at && !job.checked_out_at ? (
                  <ActionForm action={checkOutAction}>
                    <input type="hidden" name="assignmentId" value={job.assignment_id!} />
                    <SubmitButton pendingLabel="Checking out…">Check out</SubmitButton>
                  </ActionForm>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="About the job" />
            <CardBody className="space-y-4">
              <JobFacts job={job} />
              {job.description ? <p className="text-sm whitespace-pre-line text-ink-soft">{job.description}</p> : null}
              <p className="text-xs text-muted">
                {job.organization_name ?? "The business"} engages you directly on the basis above. QuickPro connects you with
                the business and is not your employer.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {canApply ? (
            <Card>
              <CardHeader title="Apply" description="The business sees your name, headline, skills and home town. Your phone number is shared only if you accept an offer." />
              <CardBody>
                <ActionForm action={applyAction.bind(null, job.id)}>
                  <Field name="note" label="Note to the business (optional)">
                    <Textarea name="note" rows={3} maxLength={1000} placeholder="Relevant experience, equipment you can bring…" />
                  </Field>
                  <SubmitButton pendingLabel="Applying…">Apply for this job</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {upcoming && profile.status !== "approved" && !job.application_status ? (
            <FormMessage tone="info">Your profile must be approved by QuickPro staff before you can apply.</FormMessage>
          ) : null}

          {job.application_status === "applied" && !job.assignment_status ? (
            <Card>
              <CardHeader title="You applied" description="The business will offer you the job if it's a fit. Check My jobs for offers." />
              <CardBody>
                <ActionForm action={withdrawAction}>
                  <input type="hidden" name="applicationId" value={job.application_id!} />
                  <SubmitButton variant="secondary" pendingLabel="Withdrawing…">
                    Withdraw application
                  </SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {accepted && now < job.ends_at ? (
            <Card>
              <CardHeader title="Can't make it?" description="Let the business know as early as you can. The spot opens for someone else." />
              <CardBody>
                <ActionForm action={cancelMyAssignmentAction}>
                  <input type="hidden" name="assignmentId" value={job.assignment_id!} />
                  <Input name="reason" placeholder="Reason (the business will see it)" aria-label="Reason" required maxLength={1000} />
                  <SubmitButton variant="danger" pendingLabel="Cancelling…">
                    Cancel my booking
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
