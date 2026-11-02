import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DisputeView } from "@/components/app/dispute-view";
import { uuid } from "@/lib/schemas";
import { requireUser } from "@/server/auth/session";
import { postDisputeMessageAction, withdrawDisputeAction } from "@/server/actions/trust";
import { getDispute, getDisputeThread } from "@/server/data/disputes";

export const metadata: Metadata = { title: "Dispute" };

export default async function WorkerDisputePage({
  params,
  searchParams,
}: {
  params: Promise<{ disputeId: string }>;
  searchParams: Promise<{ opened?: string }>;
}) {
  const { disputeId } = await params;
  const user = await requireUser();
  if (!uuid.safeParse(disputeId).success) notFound();
  const dispute = await getDispute(user.id, disputeId);
  if (!dispute || dispute.context !== "shift" || dispute.viewer_side === "staff") notFound();
  const messages = await getDisputeThread(user.id, dispute.id);
  return (
    <DisputeView
      dispute={dispute}
      messages={messages}
      currentUserId={user.id}
      backHref="/app/worker/disputes"
      backLabel="Disputes"
      workHref={dispute.job_id ? `/app/worker/jobs/${dispute.job_id}` : undefined}
      opened={(await searchParams).opened === "1"}
      postAction={postDisputeMessageAction.bind(null, dispute.id)}
      withdrawAction={withdrawDisputeAction.bind(null, dispute.id)}
    />
  );
}
