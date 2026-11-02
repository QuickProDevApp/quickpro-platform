import "server-only";
import { DisputePanel, ReviewPanel } from "@/components/app/trust";
import { openDisputeAction, submitReviewAction } from "@/server/actions/trust";
import { listWorkDisputes } from "@/server/data/disputes";
import { getWorkReviews, type WorkContext } from "@/server/data/reviews";

/**
 * Reviews and disputes for one piece of work: a project, a subcontract or one
 * worker's shift. The database decides who sees and may do what; `canAct`
 * only hides forms from people who can't use them (team members who aren't
 * dispatchers).
 */
export async function WorkTrust({
  userId,
  context,
  targetId,
  orgId,
  finished,
  engaged,
  canAct,
}: {
  userId: string;
  context: WorkContext;
  targetId: string;
  /** The viewer's business, or null for a worker acting for themselves. */
  orgId: string | null;
  finished: boolean;
  /** The work was agreed (awarded, accepted, booked). */
  engaged: boolean;
  canAct: boolean;
}) {
  if (!engaged) return null;
  const [reviews, disputes] = await Promise.all([
    getWorkReviews(userId, context, targetId),
    listWorkDisputes(userId, context, targetId),
  ]);
  const prefix = `${context}-${targetId.slice(0, 8)}`;
  const base = orgId ? `/app/org/${orgId}/disputes` : "/app/worker/disputes";
  const mineOpen = disputes.some((d) => d.status === "open" && d.opener_side === reviews.mySide);
  return (
    <>
      {finished || reviews.mine || reviews.theirs ? (
        <ReviewPanel
          reviews={reviews}
          action={submitReviewAction.bind(null, context, targetId)}
          idPrefix={prefix}
          finished={finished}
        />
      ) : null}
      <DisputePanel
        disputes={disputes}
        href={(id) => `${base}/${id}`}
        action={canAct && !mineOpen ? openDisputeAction.bind(null, context, targetId, orgId) : undefined}
        otherName={reviews.otherName}
        idPrefix={`${prefix}-dispute`}
      />
    </>
  );
}
