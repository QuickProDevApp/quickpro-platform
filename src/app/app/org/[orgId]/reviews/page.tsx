import type { Metadata } from "next";
import { ReceivedReviews, RatingSummary } from "@/components/app/trust";
import { Card, CardBody } from "@/components/ui/card";
import { requireMembership } from "@/server/actions/guards";
import { canDispatch } from "@/server/data/organizations";
import { getOrgRating, listOrgReviews } from "@/server/data/reviews";
import { flagReviewAction, replyToReviewAction } from "@/server/actions/trust";

export const metadata: Metadata = { title: "Reviews" };

export default async function OrganizationReviewsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  const [rating, reviews] = await Promise.all([getOrgRating(user.id, org.id), listOrgReviews(user.id, org.id)]);
  const who =
    org.kind === "customer"
      ? "contractors you hired"
      : "customers, contractors you subcontracted for or to, and workers you booked";
  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-faint uppercase">Your rating</p>
            <div className="mt-1 text-base">
              <RatingSummary rating={rating} />
            </div>
          </div>
          <p className="max-w-md text-[13px] text-muted">
            From {who}. A review is published once both sides have reviewed each other, or 14 days after the work is
            finished. {org.kind === "contractor" ? "Customers see your rating when they choose who to invite." : "Contractors see your rating on your requests."}
          </p>
        </CardBody>
      </Card>
      <ReceivedReviews
        reviews={reviews}
        replyAction={replyToReviewAction}
        flagAction={flagReviewAction}
        canRespond={canDispatch(org.my_role)}
        contextHref={(r) => (r.request_id ? `/app/org/${org.id}/requests/${r.request_id}` : undefined)}
      />
    </div>
  );
}
