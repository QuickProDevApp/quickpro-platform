import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingSummary } from "@/components/app/trust";
import { WorkTrust } from "@/components/app/work-trust";
import { AssignmentStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime, formatShift } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { requireMembership } from "@/server/actions/guards";
import { getJob, listJobPeople } from "@/server/data/jobs";
import { canDispatch } from "@/server/data/organizations";
import { getJobWorkerRatings } from "@/server/data/reviews";

export const metadata: Metadata = { title: "Shift" };

/** One worker's shift on a job: the business reviews it and raises problems here. */
export default async function ShiftPage({
  params,
}: {
  params: Promise<{ orgId: string; jobId: string; assignmentId: string }>;
}) {
  const { orgId, jobId, assignmentId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (!uuid.safeParse(jobId).success || !uuid.safeParse(assignmentId).success) notFound();
  const job = await getJob(user.id, jobId);
  if (!job || job.organization_id !== org.id) notFound();
  const dispatcher = canDispatch(org.my_role);
  const [people, ratings] = await Promise.all([
    listJobPeople(user.id, job.id),
    dispatcher ? getJobWorkerRatings(user.id, job.id) : undefined,
  ]);
  const person = people.find((p) => p.assignment_id === assignmentId);
  if (!person) notFound();
  const status = person.assignment_status!;
  const name = person.full_name || "Unnamed worker";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/app/org/${org.id}/jobs/${job.id}`} className="text-sm text-muted hover:text-ink">
          ← {job.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">{name}</h2>
          <AssignmentStatusBadge status={status} />
        </div>
        <p className="tabular text-sm text-muted">
          {formatShift(job.starts_at, job.ends_at)} · {job.area_name}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <WorkTrust
            userId={user.id}
            context="shift"
            targetId={assignmentId}
            orgId={org.id}
            finished={status === "completed"}
            engaged={status === "accepted" || status === "completed" || (status === "cancelled" && person.responded_at !== null)}
            canAct={dispatcher}
          />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Attendance" />
            <CardBody className="space-y-2 text-sm text-ink-soft">
              <p>{person.checked_in_at ? `Checked in ${formatDateTime(person.checked_in_at)}` : "Didn't check in."}</p>
              <p>{person.checked_out_at ? `Checked out ${formatDateTime(person.checked_out_at)}` : "No check-out recorded."}</p>
              {person.cancel_reason ? <p className="text-muted">Cancelled: {person.cancel_reason}</p> : null}
            </CardBody>
          </Card>
          {ratings ? (
            <Card>
              <CardHeader title="Rating from businesses" description="Published reviews from every business this worker has worked for." />
              <CardBody>
                <RatingSummary rating={ratings.get(person.worker_user_id)} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
