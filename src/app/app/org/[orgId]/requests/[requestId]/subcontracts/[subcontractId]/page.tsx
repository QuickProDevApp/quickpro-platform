import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobThread } from "@/components/app/job-thread";
import { ProjectJobs } from "@/components/app/project";
import { EndSubcontract, SubcontractTerms } from "@/components/app/subcontracts";
import { uuid } from "@/lib/schemas";
import { requireMembership } from "@/server/actions/guards";
import { canDispatch } from "@/server/data/organizations";
import { getRequest, listProjectAttendance, listProjectJobs } from "@/server/data/requests";
import { getSubcontractThread, listProjectSubcontracts } from "@/server/data/subcontracts";
import { cancelSubcontractAction, postSubcontractMessageAction } from "../../../actions";

export const metadata: Metadata = { title: "Subcontract" };

/** The prime contractor's view of one subcontract: terms, the subcontractor's jobs, and their thread. */
export default async function SubcontractPage({
  params,
}: {
  params: Promise<{ orgId: string; requestId: string; subcontractId: string }>;
}) {
  const { orgId, requestId, subcontractId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "contractor" || !uuid.safeParse(requestId).success || !uuid.safeParse(subcontractId).success) notFound();
  const request = await getRequest(user.id, requestId);
  if (!request) notFound();
  const projectHref = `/app/org/${org.id}/requests/${request.id}`;
  // The subcontractor works from the project page itself.
  if (request.awarded_contractor_id !== org.id) redirect(projectHref);
  const [subcontracts, jobs, attendance] = await Promise.all([
    listProjectSubcontracts(user.id, request.id),
    listProjectJobs(user.id, request.id),
    listProjectAttendance(user.id, request.id),
  ]);
  const sc = subcontracts.find((s) => s.id === subcontractId && s.prime_id === org.id);
  if (!sc) notFound();
  const messages = await getSubcontractThread(user.id, sc.id);
  const theirJobs = jobs.filter((j) => j.organization_id === sc.sub_id);
  const dispatcher = canDispatch(org.my_role);
  const live = sc.status === "offered" || sc.status === "accepted";

  return (
    <div className="space-y-6">
      <div>
        <Link href={projectHref} className="text-sm text-muted hover:text-ink">
          ← Project: {request.title}
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-ink">{sc.sub_name}</h2>
        <p className="text-sm text-muted">
          Subcontractor on {request.customer_name}&apos;s project · {request.area_name}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {sc.status === "accepted" || sc.status === "completed" ? (
            <ProjectJobs
              jobs={theirJobs}
              attendance={attendance.filter((a) => theirJobs.some((j) => j.id === a.job_id))}
              emptyText={`${sc.sub_name} schedules and staffs its own jobs for this part. You'll see each one here, with attendance.`}
            />
          ) : null}
          {sc.status !== "declined" ? (
            <JobThread
              title={`Messages with ${sc.sub_name}`}
              messages={messages}
              currentUserId={user.id}
              postAction={
                sc.status === "cancelled" ? undefined : postSubcontractMessageAction.bind(null, org.id, request.id, sc.id)
              }
              description={`Between your team and ${sc.sub_name}. ${request.customer_name} doesn't see this thread.`}
              placeholder="Start time, access, materials…"
            />
          ) : null}
        </div>
        {/* Phones read the terms first. */}
        <div className="-order-1 space-y-6 lg:order-none">
          <SubcontractTerms subcontract={sc} viewer="prime" />
          {dispatcher && live ? (
            <EndSubcontract
              action={cancelSubcontractAction.bind(null, org.id, request.id, sc.id)}
              otherName={sc.sub_name}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
