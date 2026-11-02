import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/app/job-form";
import { FormMessage } from "@/components/ui/form";
import { uuid } from "@/lib/schemas";
import { requireMembership } from "@/server/actions/guards";
import { getMarketMinPay, listEngagementTypes } from "@/server/data/jobs";
import { canDispatch, getInsuranceStatus } from "@/server/data/organizations";
import { listCategories, listServiceAreas, listSkills } from "@/server/data/reference";
import { getRequest, getRequestSite } from "@/server/data/requests";
import { listProjectSubcontracts } from "@/server/data/subcontracts";
import { createJobAction } from "../actions";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ request?: string }>;
}) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "contractor" || !canDispatch(org.my_role)) notFound();

  if (org.status !== "approved") {
    return (
      <FormMessage tone="info">Your business can post jobs once QuickPro staff approve your registration.</FormMessage>
    );
  }

  // Scheduling a job for a project this business won, or its accepted part of one as a subcontractor.
  const requestParam = (await searchParams).request;
  const request = requestParam && uuid.safeParse(requestParam).success ? await getRequest(user.id, requestParam) : null;
  const subcontract =
    request && request.awarded_contractor_id !== org.id
      ? (await listProjectSubcontracts(user.id, request.id)).find((s) => s.sub_id === org.id && s.status === "accepted")
      : undefined;
  if (requestParam && (!request || (request.awarded_contractor_id !== org.id && !subcontract))) notFound();
  if (request && (request.status !== "awarded" || request.work_completed_at)) {
    return (
      <FormMessage tone="info">
        {request.status !== "awarded"
          ? `This project is ${request.status}. New jobs can't be added to it.`
          : subcontract
            ? "The project was reported complete. New jobs can't be added unless the customer sends it back."
            : "You reported this project complete. The customer can send it back if more work is needed."}
      </FormMessage>
    );
  }

  const [insurance, categories, areas, skills, engagementTypes, minPay, site] = await Promise.all([
    getInsuranceStatus(user.id, org.id),
    listCategories(user.id),
    listServiceAreas(user.id, org.market_id),
    listSkills(user.id),
    listEngagementTypes(user.id),
    getMarketMinPay(user.id, org.market_id),
    request ? getRequestSite(user.id, request.id) : Promise.resolve(null),
  ]);
  if (insurance !== "current") {
    return (
      <FormMessage tone="bad">
        Posting jobs needs a current general liability certificate reviewed by QuickPro staff. Upload your renewal on
        the Documents tab.
      </FormMessage>
    );
  }

  return (
    <div className="max-w-3xl">
      {request ? (
        <Link href={`/app/org/${org.id}/requests/${request.id}`} className="text-sm text-muted hover:text-ink">
          ← {request.title}
        </Link>
      ) : null}
      <h2 className="mb-4 text-lg font-semibold text-ink">
        {subcontract ? "Schedule a job for your part" : request ? "Schedule a job for this project" : "Post a job"}
      </h2>
      <JobForm
        action={createJobAction.bind(null, org.id, request?.id ?? null)}
        categories={categories}
        areas={areas}
        skills={skills}
        engagementTypes={engagementTypes}
        minPayCents={minPay}
        submitLabel={request ? "Schedule job" : "Post job"}
        intro={
          subcontract ? (
            <FormMessage tone="info">
              Filled in from your subcontract with {subcontract.prime_name}. Workers see the job, your business name and
              the town, never the customer&apos;s name or the subcontract price. {subcontract.prime_name} and the
              customer see this job&apos;s staffing and attendance on the project.
            </FormMessage>
          ) : request ? (
            <FormMessage tone="info">
              Filled in from {request.customer_name}&apos;s request. Workers see the job, your business name and the
              town, never the customer&apos;s name or your quote. The customer sees this job&apos;s staffing and
              attendance on the project.
            </FormMessage>
          ) : null
        }
        prefill={
          request
            ? {
                title: request.title,
                description: subcontract ? subcontract.scope : request.description,
                category_id: request.category_id,
                service_area_id: request.service_area_id,
                local_date: request.preferred_start,
              }
            : undefined
        }
        site={
          site
            ? {
                address_line1: site.address_line1,
                city: site.city,
                postal_code: site.postal_code,
                site_notes: site.access_notes,
                contact_name: site.contact_name,
                contact_phone: site.contact_phone,
              }
            : undefined
        }
      />
    </div>
  );
}
