import "server-only";
import { withUser } from "@/server/db/client";
import type { ReviewSide, WorkContext } from "@/server/data/reviews";

// Disputes about agreed work (D-028). The two sides and QuickPro staff
// discuss each one on its own thread; staff record the outcome.

export type DisputeReason = "quality" | "incomplete" | "no_show" | "hours" | "payment" | "damage" | "conduct" | "other";
export type DisputeStatus = "open" | "resolved" | "withdrawn";
export type DisputeOutcome = "resolved_by_parties" | "upheld" | "partly_upheld" | "not_upheld";

export type Dispute = {
  id: string;
  context: WorkContext;
  target_id: string;
  request_id: string | null;
  job_id: string | null;
  title: string;
  opener_side: ReviewSide;
  opener_name: string;
  opener_org_id: string | null;
  respondent_side: ReviewSide;
  respondent_name: string;
  respondent_org_id: string | null;
  reason: DisputeReason;
  summary: string;
  desired_outcome: string;
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  resolution: string | null;
  resolved_at: Date | null;
  withdrawn_at: Date | null;
  withdraw_note: string | null;
  message_count: number;
  last_activity_at: Date;
  created_at: Date;
};

export type DisputeWithViewer = Dispute & { viewer_side: "opener" | "respondent" | "staff" };

/** A business's disputes (either side); with orgId null, the signed-in worker's own. */
export function listDisputes(userId: string, orgId: string | null, status: DisputeStatus | null = null) {
  return withUser(userId, (tx) => tx<Dispute[]>`select * from public.list_disputes(${orgId}, ${status}::public.dispute_status)`);
}

/** Every dispute, for QuickPro staff; open ones first. */
export function listAdminDisputes(userId: string, status: DisputeStatus | null = null) {
  return withUser(userId, (tx) => tx<Dispute[]>`select * from public.admin_disputes(${status}::public.dispute_status)`);
}

export async function getDispute(userId: string, disputeId: string): Promise<DisputeWithViewer | null> {
  try {
    const [row] = await withUser(userId, (tx) => tx<DisputeWithViewer[]>`select * from public.get_dispute(${disputeId})`);
    return row ?? null;
  } catch (error) {
    if ((error as { code?: string }).code === "P0002") return null;
    throw error;
  }
}

export type DisputeMessage = {
  id: string;
  author_id: string | null;
  author_name: string;
  author_side: "opener" | "respondent" | "staff";
  organization_name: string | null;
  body: string;
  created_at: Date;
};

export function getDisputeThread(userId: string, disputeId: string) {
  return withUser(userId, (tx) => tx<DisputeMessage[]>`select * from public.dispute_thread(${disputeId})`);
}

export type WorkDispute = {
  id: string;
  opener_side: ReviewSide;
  reason: DisputeReason;
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  created_at: Date;
};

export function listWorkDisputes(userId: string, context: WorkContext, targetId: string) {
  return withUser(userId, (tx) => tx<WorkDispute[]>`
    select * from public.work_disputes(${context}::public.work_context, ${targetId})
  `);
}

export function openDispute(
  userId: string,
  context: WorkContext,
  targetId: string,
  input: { reason: DisputeReason; summary: string; desiredOutcome: string },
) {
  return withUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      select public.open_dispute(${context}::public.work_context, ${targetId}, ${input.reason}::public.dispute_reason,
                                 ${input.summary}, ${input.desiredOutcome}) as id
    `;
    return id;
  });
}

export function postDisputeMessage(userId: string, disputeId: string, body: string) {
  return withUser(userId, (tx) => tx`select public.post_dispute_message(${disputeId}, ${body})`);
}

export function withdrawDispute(userId: string, disputeId: string, note: string) {
  return withUser(userId, (tx) => tx`select public.withdraw_dispute(${disputeId}, ${note})`);
}

export function resolveDispute(userId: string, disputeId: string, outcome: DisputeOutcome, resolution: string) {
  return withUser(userId, (tx) => tx`
    select public.resolve_dispute(${disputeId}, ${outcome}::public.dispute_outcome, ${resolution})
  `);
}
