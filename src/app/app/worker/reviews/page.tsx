import type { Metadata } from "next";
import { ReceivedReviews, RatingSummary } from "@/components/app/trust";
import { Card, CardBody } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { flagReviewAction, replyToReviewAction } from "@/server/actions/trust";
import { getMyWorkerRating, listMyWorkerReviews } from "@/server/data/reviews";

export const metadata: Metadata = { title: "Reviews" };

export default async function WorkerReviewsPage() {
  const user = await requireUser();
  const [rating, reviews] = await Promise.all([getMyWorkerRating(user.id), listMyWorkerReviews(user.id)]);
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
            From businesses you worked shifts for. Businesses see your rating when you apply. A review is published once
            you&apos;ve both reviewed each other, or 14 days after the shift. Review a business from the shift in My jobs.
          </p>
        </CardBody>
      </Card>
      <ReceivedReviews reviews={reviews} replyAction={replyToReviewAction} flagAction={flagReviewAction} canRespond />
    </div>
  );
}
