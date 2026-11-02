import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DisputeView } from "@/components/app/dispute-view";
import { uuid } from "@/lib/schemas";
import { requireMembership } from "@/server/actions/guards";
import { postDisputeMessageAction, withdrawDisputeAction } from "@/server/actions/trust";
import { getDispute, getDisputeThread, type Dispute } from "@/server/data/disputes";
import { canDispatch } from "@/server/data/organizations";

export const metadata: Metadata = { title: "Dispute" };

/** Where the work a dispute is about lives, for this business. */
function workHref(orgId: string, d: Dispute): string | undefined {
  if (d.context === "shift") return d.job_id ? `/app/org/${orgId}/jobs/${d.job_id}/shifts/${d.target_id}` : undefined;
  if (d.context === "subcontract") {
    const prime = (d.opener_side === "prime" ? d.opener_org_id : d.respondent_org_id) === orgId;
    return prime ? `/app/org/${orgId}/requests/${d.request_id}/subcontracts/${d.target_id}` : `/app/org/${orgId}/requests/${d.request_id}`;
  }
  return d.request_id ? `/app/org/${orgId}/requests/${d.request_id}` : undefined;
}

export default async function OrganizationDisputePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; disputeId: string }>;
  searchParams: Promise<{ opened?: string }>;
}) {
  const { orgId, disputeId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (!uuid.safeParse(disputeId).success) notFound();
  const dispute = await getDispute(user.id, disputeId);
  // Only disputes this business is a side of; staff use the admin pages.
  if (!dispute || (dispute.opener_org_id !== org.id && dispute.respondent_org_id !== org.id)) notFound();
  const messages = await getDisputeThread(user.id, dispute.id);
  const dispatcher = canDispatch(org.my_role);
  const side = { ...dispute, viewer_side: dispute.opener_org_id === org.id ? "opener" : "respondent" } as const;
  return (
    <DisputeView
      dispute={side}
      messages={messages}
      currentUserId={user.id}
      backHref={`/app/org/${org.id}/disputes`}
      backLabel="Disputes"
      workHref={workHref(org.id, dispute)}
      opened={(await searchParams).opened === "1"}
      postAction={dispatcher ? postDisputeMessageAction.bind(null, dispute.id) : undefined}
      withdrawAction={dispatcher ? withdrawDisputeAction.bind(null, dispute.id) : undefined}
    />
  );
}
