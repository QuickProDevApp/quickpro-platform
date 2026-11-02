import type { Metadata } from "next";
import Link from "next/link";
import { FilterLinks } from "@/components/app/filter-links";
import { Stars } from "@/components/app/trust";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { ActionForm, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatDateTime } from "@/lib/labels";
import { requireAdmin } from "@/server/auth/session";
import { moderateReviewAction } from "@/server/actions/trust";
import { listAdminReviews, type AdminReview, type AdminReviewFilter } from "@/server/data/reviews";

export const metadata: Metadata = { title: "Reviews" };

const FILTERS: AdminReviewFilter[] = ["flagged", "hidden", "low", "all"];

function workHref(r: AdminReview): string | undefined {
  if (r.context === "shift") return r.job_id ? `/app/admin/jobs/${r.job_id}` : undefined;
  return r.request_id ? `/app/admin/requests/${r.request_id}` : undefined;
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; done?: string }>;
}) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const requested = query.show;
  const show = FILTERS.find((f) => f === requested) ?? "flagged";
  const reviews = await listAdminReviews(admin.id, show);
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Reviews flagged by the business or worker they're about. Hide one only for abuse, private details or the wrong job; a hidden review stops counting toward the rating, and both sides see your reason."
      />
      <FilterLinks
        basePath="/app/admin/reviews"
        param="show"
        current={show === "flagged" ? undefined : show}
        options={[
          { value: undefined, label: "Flagged" },
          { value: "hidden", label: "Hidden" },
          { value: "low", label: "1–2 stars" },
          { value: "all", label: "All" },
        ]}
      />
      {query.done === "hidden" ? (
        <FormMessage tone="ok">Review hidden. It no longer counts toward the rating, and both sides see your reason.</FormMessage>
      ) : query.done === "kept" ? (
        <FormMessage tone="ok">Review kept and the flag cleared.</FormMessage>
      ) : null}
      <Card>
        {reviews.length === 0 ? (
          <div className="p-5">
            <EmptyState title={show === "flagged" ? "No flagged reviews" : "No reviews match this filter"} />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {reviews.map((r) => {
              const href = workHref(r);
              return (
                <li key={r.id} className="space-y-2 px-4 py-4 sm:px-5" data-testid="admin-review">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {r.author_name} <span className="font-normal text-muted">about</span> {r.subject_name}
                      </p>
                      <p className="text-[13px] text-muted">
                        {href ? (
                          <Link href={href} className="hover:text-ink hover:underline">
                            {r.title}
                          </Link>
                        ) : (
                          r.title
                        )}{" "}
                        · {formatDate(r.created_at)}
                        {r.published ? "" : " · not published yet"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.hidden_at ? <Badge tone="bad">Hidden</Badge> : r.flagged_at ? <Badge tone="warn">Flagged</Badge> : null}
                      <Stars rating={r.rating} />
                    </div>
                  </div>
                  {r.body ? <p className="text-sm whitespace-pre-line text-ink-soft">{r.body}</p> : null}
                  {r.reply ? (
                    <p className="border-l-2 border-line pl-3 text-[13px] text-ink-soft">
                      <span className="font-medium text-ink">Reply:</span> {r.reply}
                    </p>
                  ) : null}
                  {r.flagged_at && !r.hidden_at ? (
                    <p className="rounded-md bg-warn/10 px-3 py-2 text-[13px] text-ink">
                      Flagged {formatDateTime(r.flagged_at)}: {r.flag_reason}
                    </p>
                  ) : null}
                  {r.hidden_at ? (
                    <p className="text-[13px] text-bad">
                      Hidden {formatDateTime(r.hidden_at)}: {r.hidden_reason}
                    </p>
                  ) : null}
                  <ActionForm action={moderateReviewAction} className="flex flex-wrap items-start gap-2 pt-1">
                    <input type="hidden" name="reviewId" value={r.id} />
                    <input type="hidden" name="show" value={show} />
                    {r.hidden_at ? (
                      <SubmitButton size="sm" variant="secondary" name="decision" value="keep" pendingLabel="Saving…">
                        Show it again
                      </SubmitButton>
                    ) : (
                      <>
                        <div className="min-w-48 flex-1">
                          <Input
                            name="reason"
                            id={`hide-${r.id}`}
                            aria-label="Reason for hiding"
                            placeholder="Reason for hiding (both sides see it)"
                            maxLength={500}
                          />
                        </div>
                        <SubmitButton size="sm" variant="danger" name="decision" value="hide" pendingLabel="Saving…">
                          Hide review
                        </SubmitButton>
                        {r.flagged_at ? (
                          <SubmitButton size="sm" variant="secondary" name="decision" value="keep" pendingLabel="Saving…">
                            Keep it
                          </SubmitButton>
                        ) : null}
                      </>
                    )}
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
