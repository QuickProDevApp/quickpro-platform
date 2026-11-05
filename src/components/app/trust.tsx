import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatDate, formatDateTime } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { DisputeOutcome, DisputeReason, DisputeStatus, WorkDispute } from "@/server/data/disputes";
import type { Rating, ReceivedReview, WorkReviews } from "@/server/data/reviews";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

// Labels ------------------------------------------------------------------------

export const DISPUTE_REASON_LABEL: Record<DisputeReason, string> = {
  quality: "Quality of the work",
  incomplete: "Work not finished",
  no_show: "No-show or late",
  hours: "Hours or attendance",
  payment: "Payment",
  damage: "Damage or loss",
  conduct: "Conduct or safety",
  other: "Something else",
};

export const DISPUTE_OUTCOME_LABEL: Record<DisputeOutcome, string> = {
  resolved_by_parties: "Resolved between the two sides",
  upheld: "Upheld",
  partly_upheld: "Partly upheld",
  not_upheld: "Not upheld",
};

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  return status === "open" ? (
    <Badge tone="warn" dot>
      Open
    </Badge>
  ) : status === "resolved" ? (
    <Badge tone="ok">Closed</Badge>
  ) : (
    <Badge tone="neutral">Withdrawn</Badge>
  );
}

// Stars -------------------------------------------------------------------------

function StarIcon({ filled, className = "h-4 w-4" }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={`${className} ${filled ? "fill-current" : "fill-none"}`} strokeWidth={1.4} stroke="currentColor">
      <path
        strokeLinejoin="round"
        d="M10 2.2l2.35 4.9 5.35.72-3.9 3.74.96 5.32L10 14.3l-4.76 2.58.96-5.32-3.9-3.74 5.35-.72L10 2.2z"
      />
    </svg>
  );
}

export function Stars({ rating, className = "h-4 w-4" }: { rating: number; className?: string }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5 text-charcoal" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= rounded} className={`${className} ${n <= rounded ? "" : "text-line-strong"}`} />
      ))}
    </span>
  );
}

/** "★ 4.8 · 12 reviews", or "No reviews yet". Only published, visible reviews count. */
export function RatingSummary({ rating, compact = false }: { rating: Rating | undefined | null; compact?: boolean }) {
  if (!rating || rating.rating_count === 0 || rating.rating_avg === null) {
    return <span className="text-[13px] text-muted">No reviews yet</span>;
  }
  const avg = Number(rating.rating_avg);
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink" data-testid="rating">
      {compact ? <StarIcon filled className="h-3.5 w-3.5 text-charcoal" /> : <Stars rating={avg} className="h-3.5 w-3.5" />}
      <span className="tabular font-medium">{avg.toFixed(1)}</span>
      <span className="text-muted">
        · {rating.rating_count} {rating.rating_count === 1 ? "review" : "reviews"}
      </span>
    </span>
  );
}

const STAR_WORDS = ["", "Poor", "Below expectations", "OK", "Good", "Excellent"];

/** Five radio buttons drawn as stars (pure CSS: the checked star and those before it fill in). */
function StarInput({ name, id }: { name: string; id: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink">Rating</legend>
      <div className="flex w-fit flex-row-reverse justify-end gap-1 [&_input:checked~label]:text-charcoal [&_input:focus-visible+label]:ring-2 [&_input:focus-visible+label]:ring-charcoal/40 [&_label:hover]:text-charcoal [&_label:hover~label]:text-charcoal">
        {[5, 4, 3, 2, 1].map((n) => (
          <span key={n} className="contents">
            <input type="radio" name={name} id={`${id}-${n}`} value={n} className="peer sr-only" required />
            <label
              htmlFor={`${id}-${n}`}
              className="cursor-pointer rounded-md p-1 text-line-strong transition-colors"
              title={`${n} – ${STAR_WORDS[n]}`}
            >
              <StarIcon filled className="h-7 w-7" />
              <span className="sr-only">
                {n} {n === 1 ? "star" : "stars"}: {STAR_WORDS[n]}
              </span>
            </label>
          </span>
        ))}
      </div>
    </fieldset>
  );
}

// Reviewing one piece of work --------------------------------------------------

/**
 * Both sides of a review on one finished piece of work: the form while the
 * viewer can still review, their own review and when the other side will see
 * it, and the other side's review once it's published.
 */
export function ReviewPanel({
  reviews,
  action,
  idPrefix,
  finished,
}: {
  reviews: WorkReviews;
  action: Action;
  idPrefix: string;
  /** False while the work is still in progress. */
  finished: boolean;
}) {
  const { mine, theirs, otherName, windowClosesAt } = reviews;
  return (
    <Card>
      <CardHeader
        title={`Review ${otherName}`}
        description="Both sides review each other. Neither sees the other's review until both have written one, or the 14-day window closes."
      />
      <CardBody className="space-y-5">
        {reviews.canReview ? (
          <ActionForm action={action} className="space-y-4">
            <StarInput name="rating" id={`${idPrefix}-rating`} />
            <Field
              name="body"
              id={`${idPrefix}-body`}
              label="What went well, or what didn't"
              hint={`Optional for 3 stars and up. ${windowClosesAt ? `You can review until ${formatDate(windowClosesAt)}.` : ""}`}
            >
              <Textarea name="body" id={`${idPrefix}-body`} rows={3} maxLength={2000} />
            </Field>
            <SubmitButton pendingLabel="Saving…">Submit review</SubmitButton>
          </ActionForm>
        ) : mine ? (
          <div data-testid="my-review">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium tracking-wide text-faint uppercase">Your review</p>
              {mine.published ? (
                <Badge tone="ok">Published</Badge>
              ) : (
                <Badge tone="neutral">Not shared yet</Badge>
              )}
            </div>
            <div className="mt-1.5">
              <Stars rating={mine.rating ?? 0} />
            </div>
            {mine.body ? <p className="mt-1.5 text-sm whitespace-pre-line text-ink-soft">{mine.body}</p> : null}
            {!mine.published && windowClosesAt ? (
              <p className="mt-1.5 text-[13px] text-muted">
                {otherName} sees it once they review you, or on {formatDate(windowClosesAt)}.
              </p>
            ) : null}
            {mine.hidden ? <p className="mt-1.5 text-[13px] text-bad">Hidden by QuickPro staff.</p> : null}
            {mine.reply ? (
              <p className="mt-2 border-l-2 border-line pl-3 text-[13px] text-ink-soft">
                <span className="font-medium text-ink">{otherName} replied:</span> {mine.reply}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">
            {!finished
              ? "Reviews open when the work is finished."
              : windowClosesAt && windowClosesAt < new Date()
                ? `The review window closed on ${formatDate(windowClosesAt)}.`
                : "Owners, admins and dispatchers on your team can write the review."}
          </p>
        )}
        {theirs ? (
          <div className={reviews.canReview || mine ? "border-t border-line pt-4" : ""} data-testid="their-review">
            <p className="text-xs font-medium tracking-wide text-faint uppercase">{otherName}&apos;s review of you</p>
            <div className="mt-1.5">
              <Stars rating={theirs.rating ?? 0} />
            </div>
            {theirs.hidden ? (
              <p className="mt-1.5 text-[13px] text-muted">Hidden by QuickPro staff.</p>
            ) : theirs.body ? (
              <p className="mt-1.5 text-sm whitespace-pre-line text-ink-soft">{theirs.body}</p>
            ) : null}
            <p className="mt-1.5 text-[13px] text-muted">Reply to it or flag it from your Reviews page.</p>
          </div>
        ) : mine && !mine.published ? null : mine ? (
          <p className="border-t border-line pt-4 text-[13px] text-muted">{otherName} didn&apos;t leave a review.</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

// Disputes on one piece of work ---------------------------------------------

/** Disputes about one piece of work, and a form to raise one, behind a disclosure. */
export function DisputePanel({
  disputes,
  href,
  action,
  otherName,
  idPrefix,
}: {
  disputes: WorkDispute[];
  href: (id: string) => string;
  /** Present when the viewer can raise a dispute here. */
  action?: Action;
  otherName: string;
  idPrefix: string;
}) {
  if (!disputes.length && !action) return null;
  return (
    <Card>
      <CardHeader
        title="Problems and disputes"
        description={
          disputes.length
            ? undefined
            : `If something went wrong, raise it here. ${otherName} and QuickPro staff see it and reply on its own thread.`
        }
      />
      {disputes.length ? (
        <ul className="divide-y divide-line border-b border-line">
          {disputes.map((d) => (
            <li key={d.id}>
              <Link
                href={href(d.id)}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-subtle/60 sm:px-5"
                data-testid="work-dispute"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{DISPUTE_REASON_LABEL[d.reason]}</span>
                  <span className="block text-[13px] text-muted">
                    Raised {formatDateTime(d.created_at)}
                    {d.outcome ? ` · ${DISPUTE_OUTCOME_LABEL[d.outcome]}` : ""}
                  </span>
                </span>
                <DisputeStatusBadge status={d.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {action ? (
        <CardBody>
          <details className="group">
            <summary className="inline-flex h-9 cursor-pointer items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-subtle">
              Report a problem…
            </summary>
            <ActionForm action={action} className="mt-4 space-y-4">
              <Field name="reason" id={`${idPrefix}-reason`} label="What is it about?">
                <Select name="reason" id={`${idPrefix}-reason`} required defaultValue="">
                  <option value="" disabled>
                    Choose one
                  </option>
                  {Object.entries(DISPUTE_REASON_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                name="summary"
                id={`${idPrefix}-summary`}
                label="What happened"
                hint="Dates, times, who was involved. Stick to facts; the other side reads this."
              >
                <Textarea name="summary" id={`${idPrefix}-summary`} rows={4} minLength={20} maxLength={2000} required />
              </Field>
              <Field
                name="desiredOutcome"
                id={`${idPrefix}-outcome`}
                label="What would put it right"
                hint="Optional. For example: a return visit, corrected hours."
              >
                <Input name="desiredOutcome" id={`${idPrefix}-outcome`} maxLength={1000} />
              </Field>
              <p className="text-[13px] text-muted">
                QuickPro staff review every dispute and record an outcome. QuickPro doesn&apos;t hold or move payments
                yet, so refunds or pay corrections are settled between you.
              </p>
              <SubmitButton variant="secondary" pendingLabel="Sending…">
                Raise dispute
              </SubmitButton>
            </ActionForm>
          </details>
        </CardBody>
      ) : null}
    </Card>
  );
}

// Reviews received ------------------------------------------------------------

/** Reviews about a business or a worker, with a reply and a flag for each. */
export function ReceivedReviews({
  reviews,
  replyAction,
  flagAction,
  canRespond,
  contextHref,
}: {
  reviews: (Pick<ReceivedReview, "id" | "title" | "author_name" | "rating" | "body" | "reply" | "replied_at" | "flagged" | "hidden" | "hidden_reason" | "created_at"> & {
    request_id?: string | null;
  })[];
  replyAction: Action;
  flagAction: Action;
  canRespond: boolean;
  contextHref?: (r: { request_id?: string | null }) => string | undefined;
}) {
  if (!reviews.length) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No published reviews yet">
            Reviews appear here once both sides have reviewed each other, or 14 days after the work is finished.
          </EmptyState>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-line">
        {reviews.map((r) => {
          const href = contextHref?.(r);
          return (
            <li key={r.id} className="px-4 py-4 sm:px-5" data-testid="received-review">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{r.author_name}</p>
                  <p className="text-[13px] text-muted">
                    {href ? (
                      <Link href={href} className="hover:text-ink hover:underline">
                        {r.title}
                      </Link>
                    ) : (
                      r.title
                    )}{" "}
                    · {formatDate(r.created_at)}
                  </p>
                </div>
                <Stars rating={r.rating} />
              </div>
              {r.hidden ? (
                <p className="mt-2 text-[13px] text-bad">
                  Hidden by QuickPro staff: {r.hidden_reason}. It doesn&apos;t count toward your rating.
                </p>
              ) : null}
              {r.body ? <p className="mt-2 text-sm whitespace-pre-line text-ink-soft">{r.body}</p> : null}
              {r.reply ? (
                <p className="mt-2 border-l-2 border-line pl-3 text-[13px] text-ink-soft">
                  <span className="font-medium text-ink">Your reply:</span> {r.reply}
                </p>
              ) : null}
              {canRespond && !r.hidden ? (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                  {!r.reply ? (
                    <details className="min-w-0 flex-1 basis-64">
                      <summary className="cursor-pointer text-[13px] font-medium text-brand">Reply publicly…</summary>
                      <ActionForm action={replyAction} className="mt-2 space-y-2">
                        <input type="hidden" name="reviewId" value={r.id} />
                        <Field name="reply" id={`reply-${r.id}`} label="Your reply" hint="One reply, shown with the review.">
                          <Textarea name="reply" id={`reply-${r.id}`} rows={2} maxLength={1000} />
                        </Field>
                        <SubmitButton size="sm" pendingLabel="Posting…">
                          Post reply
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                  {r.flagged ? (
                    <Badge tone="info">With QuickPro staff</Badge>
                  ) : (
                    <details className="min-w-0 flex-1 basis-64">
                      <summary className="cursor-pointer text-[13px] font-medium text-muted hover:text-ink">
                        Flag for staff…
                      </summary>
                      <ActionForm action={flagAction} className="mt-2 space-y-2">
                        <input type="hidden" name="reviewId" value={r.id} />
                        <Field
                          name="reason"
                          id={`flag-${r.id}`}
                          label="What's wrong with it"
                          hint="Abuse, private details, or the wrong job. Disagreeing with a rating isn't enough."
                        >
                          <Input name="reason" id={`flag-${r.id}`} maxLength={500} />
                        </Field>
                        <SubmitButton size="sm" variant="secondary" pendingLabel="Sending…">
                          Send to staff
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
