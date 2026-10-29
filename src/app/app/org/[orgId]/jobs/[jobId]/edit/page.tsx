import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/app/job-form";
import { uuid } from "@/lib/schemas";
import { requireMembership } from "@/server/actions/guards";
import { getJob, getJobSite, getMarketMinPay, listEngagementTypes } from "@/server/data/jobs";
import { canDispatch } from "@/server/data/organizations";
import { listCategories, listServiceAreas, listSkills } from "@/server/data/reference";
import { updateJobAction } from "../../actions";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({ params }: { params: Promise<{ orgId: string; jobId: string }> }) {
  const { orgId, jobId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (!canDispatch(org.my_role) || !uuid.safeParse(jobId).success) notFound();
  const job = await getJob(user.id, jobId);
  if (!job || job.organization_id !== org.id || !(job.status === "open" || job.status === "filled")) notFound();
  const [site, categories, areas, skills, engagementTypes, minPay] = await Promise.all([
    getJobSite(user.id, job.id),
    listCategories(user.id),
    listServiceAreas(user.id, org.market_id),
    listSkills(user.id),
    listEngagementTypes(user.id),
    getMarketMinPay(user.id, org.market_id),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href={`/app/org/${org.id}/jobs/${job.id}`} className="text-sm text-muted hover:text-ink">
        ← Back to job
      </Link>
      <h2 className="mt-1 mb-4 text-lg font-semibold text-ink">Edit job</h2>
      <JobForm
        action={updateJobAction.bind(null, org.id, job.id)}
        job={job}
        site={site}
        categories={categories}
        areas={areas}
        skills={skills}
        engagementTypes={engagementTypes}
        minPayCents={minPay}
        submitLabel="Save job"
        booked={job.accepted_count + job.offered_count > 0 || job.starts_at <= new Date()}
      />
    </div>
  );
}
