import "server-only";
import { withUser } from "@/server/db/client";

// Two-way, double-blind reviews of finished work (D-028). Every query runs as
// the signed-in user; the database decides what is published and to whom.

export type WorkContext = "project" | "subcontract" | "shift";
export type ReviewSide = "customer" | "contractor" | "prime" | "subcontractor" | "business" | "worker";

export type WorkReviewRow = {
  my_side: ReviewSide | null;
  other_name: string | null;
  can_review: boolean;
  window_closes_at: Date | null;
  review_id: string | null;
  author_side: ReviewSide | null;
  mine: boolean | null;
  rating: number | null;
  body: string | null;
  reply: string | null;
  published: boolean | null;
  hidden: boolean | null;
  created_at: Date | null;
};

export type WorkReviews = {
  mySide: ReviewSide | null;
  otherName: string;
  canReview: boolean;
  windowClosesAt: Date | null;
  mine: WorkReviewRow | null;
  theirs: WorkReviewRow | null;
};

/** The viewer's review of one piece of work, the other side's once published, and whether they can still review. */
export async function getWorkReviews(userId: string, context: WorkContext, targetId: string): Promise<WorkReviews> {
  const rows = await withUser(userId, (tx) => tx<WorkReviewRow[]>`
    select * from public.work_reviews(${context}::public.work_context, ${targetId})
  `);
  const first = rows[0];
  const reviews = rows.filter((r) => r.review_id !== null);
  return {
    mySide: first?.my_side ?? null,
    otherName: first?.other_name ?? "the other side",
    canReview: first?.can_review ?? false,
    windowClosesAt: first?.window_closes_at ?? null,
    mine: reviews.find((r) => r.mine) ?? null,
    theirs: reviews.find((r) => !r.mine) ?? null,
  };
}

export function submitReview(userId: string, context: WorkContext, targetId: string, rating: number, body: string) {
  return withUser(userId, (tx) => tx`
    select public.submit_review(${context}::public.work_context, ${targetId}, ${rating}, ${body})
  `);
}

export type ReceivedReview = {
  id: string;
  context: WorkContext;
  target_id: string;
  request_id: string | null;
  title: string;
  author_side: ReviewSide;
  author_name: string;
  rating: number;
  body: string;
  reply: string | null;
  replied_at: Date | null;
  flagged: boolean;
  hidden: boolean;
  hidden_reason: string | null;
  created_at: Date;
};

export type Rating = { rating_avg: string | null; rating_count: number };

export function listOrgReviews(userId: string, orgId: string) {
  return withUser(userId, (tx) => tx<ReceivedReview[]>`select * from public.org_reviews(${orgId})`);
}

export async function getOrgRating(userId: string, orgId: string): Promise<Rating> {
  const [row] = await withUser(userId, (tx) => tx<Rating[]>`select * from public.org_rating(${orgId})`);
  return row;
}

export type WorkerReview = Omit<ReceivedReview, "context" | "target_id" | "request_id" | "author_side">;

export function listMyWorkerReviews(userId: string) {
  return withUser(userId, (tx) => tx<WorkerReview[]>`select * from public.my_worker_reviews()`);
}

export async function getMyWorkerRating(userId: string): Promise<Rating> {
  const [row] = await withUser(userId, (tx) => tx<Rating[]>`select * from public.my_worker_rating()`);
  return row;
}

export function replyToReview(userId: string, reviewId: string, reply: string) {
  return withUser(userId, (tx) => tx`select public.reply_to_review(${reviewId}, ${reply})`);
}

export function flagReview(userId: string, reviewId: string, reason: string) {
  return withUser(userId, (tx) => tx`select public.flag_review(${reviewId}, ${reason})`);
}

export async function getRequestCustomerRating(userId: string, requestId: string): Promise<Rating> {
  const [row] = await withUser(userId, (tx) => tx<Rating[]>`select * from public.request_customer_rating(${requestId})`);
  return row;
}

export async function getJobWorkerRatings(userId: string, jobId: string) {
  const rows = await withUser(userId, (tx) => tx<(Rating & { worker_user_id: string })[]>`
    select * from public.job_worker_ratings(${jobId})
  `);
  return new Map(rows.map((r) => [r.worker_user_id, r]));
}

// Staff ------------------------------------------------------------------------

export type AdminReviewFilter = "flagged" | "hidden" | "low" | "all";

export type AdminReview = {
  id: string;
  context: WorkContext;
  title: string;
  request_id: string | null;
  job_id: string | null;
  author_name: string;
  subject_name: string;
  subject_org_id: string | null;
  subject_user_id: string | null;
  rating: number;
  body: string;
  reply: string | null;
  flag_reason: string | null;
  flagged_at: Date | null;
  hidden_at: Date | null;
  hidden_reason: string | null;
  published: boolean;
  created_at: Date;
};

export function listAdminReviews(userId: string, filter: AdminReviewFilter) {
  return withUser(userId, (tx) => tx<AdminReview[]>`select * from public.admin_reviews(${filter})`);
}

export function moderateReview(userId: string, reviewId: string, hide: boolean, reason: string) {
  return withUser(userId, (tx) => tx`select public.moderate_review(${reviewId}, ${hide}, ${reason})`);
}
