import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DisputeView } from "@/components/app/dispute-view";
import { uuid } from "@/lib/schemas";
import { requireAdmin } from "@/server/auth/session";
import { postDisputeMessageAction, resolveDisputeAction } from "@/server/actions/trust";
import { getDispute, getDisputeThread } from "@/server/data/disputes";

export const metadata: Metadata = { title: "Dispute" };

export default async function AdminDisputePage({ params }: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await params;
  const admin = await requireAdmin();
  if (!uuid.safeParse(disputeId).success) notFound();
  const found = await getDispute(admin.id, disputeId);
  if (!found) notFound();
  // Staff who also belong to one side still act as staff here.
  const dispute = { ...found, viewer_side: "staff" as const };
  const messages = await getDisputeThread(admin.id, dispute.id);
  const workHref =
    dispute.context === "shift"
      ? dispute.job_id
        ? `/app/admin/jobs/${dispute.job_id}`
        : undefined
      : dispute.request_id
        ? `/app/admin/requests/${dispute.request_id}`
        : undefined;
  return (
    <DisputeView
      dispute={dispute}
      messages={messages}
      currentUserId={admin.id}
      backHref="/app/admin/disputes"
      backLabel="Disputes"
      workHref={workHref}
      postAction={postDisputeMessageAction.bind(null, dispute.id)}
      resolveAction={resolveDisputeAction.bind(null, dispute.id)}
    />
  );
}
