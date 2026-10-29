import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/app/job-form";
import { FormMessage } from "@/components/ui/form";
import { requireMembership } from "@/server/actions/guards";
import { getMarketMinPay, listEngagementTypes } from "@/server/data/jobs";
import { canDispatch, getInsuranceStatus } from "@/server/data/organizations";
import { listCategories, listServiceAreas, listSkills } from "@/server/data/reference";
import { createJobAction } from "../actions";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewJobPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "contractor" || !canDispatch(org.my_role)) notFound();

  if (org.status !== "approved") {
    return <FormMessage tone="info">Your business can post jobs once QuickPro staff approve your registration.</FormMessage>;
  }
  const [insurance, categories, areas, skills, engagementTypes, minPay] = await Promise.all([
    getInsuranceStatus(user.id, org.id),
    listCategories(user.id),
    listServiceAreas(user.id, org.market_id),
    listSkills(user.id),
    listEngagementTypes(user.id),
    getMarketMinPay(user.id, org.market_id),
  ]);
  if (insurance !== "current") {
    return (
      <FormMessage tone="bad">
        Posting jobs needs a current general liability certificate reviewed by QuickPro staff. Upload your renewal on the
        Documents tab.
      </FormMessage>
    );
  }

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-ink">Post a job</h2>
      <JobForm
        action={createJobAction.bind(null, org.id)}
        categories={categories}
        areas={areas}
        skills={skills}
        engagementTypes={engagementTypes}
        minPayCents={minPay}
        submitLabel="Post job"
      />
    </div>
  );
}
