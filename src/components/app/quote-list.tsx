import { QuoteStatusBadge } from "@/components/ui/badge";
import { ActionForm, Input, SubmitButton } from "@/components/ui/form";
import { formatCents, formatDate, formatDateTime } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { Quote } from "@/server/data/requests";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Quotes on a request, for the customer to compare. Accepting and declining
 * sit behind a disclosure so neither happens on a stray tap.
 */
export function QuoteList({
  quotes,
  acceptAction,
  declineAction,
}: {
  quotes: Quote[];
  acceptAction?: Action;
  declineAction?: Action;
}) {
  const live = quotes.filter((q) => q.status === "submitted").length;
  return (
    <ul className="divide-y divide-line">
      {quotes.map((q) => {
        const decidable = q.status === "submitted" && !q.expired;
        return (
          <li key={q.id} className="px-4 py-4 sm:px-5" data-testid="quote">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink">{q.contractor_name}</p>
                  <QuoteStatusBadge status={q.status} expired={q.expired} />
                </div>
                <p className="mt-0.5 text-[13px] text-muted">
                  {q.estimated_start ? `Can start ${formatDate(q.estimated_start)} · ` : ""}
                  Valid until {formatDate(q.valid_until)}
                  {q.revision > 1 ? ` · Revised ${formatDateTime(q.submitted_at)}` : ` · Sent ${formatDateTime(q.submitted_at)}`}
                </p>
              </div>
              <p className="tabular text-lg font-semibold tracking-[-0.01em] text-ink">{formatCents(q.amount_cents)}</p>
            </div>
            <p className="mt-2 text-sm whitespace-pre-line text-ink-soft">{q.scope}</p>
            {q.decision_note && q.status === "declined" ? (
              <p className="mt-2 text-[13px] text-muted">Note: {q.decision_note}</p>
            ) : null}
            {decidable && acceptAction && declineAction ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <details className="group w-full sm:w-auto">
                  <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-md bg-navy px-3.5 text-sm font-medium text-white hover:bg-navy-strong sm:h-9 [&::-webkit-details-marker]:hidden">
                    Accept quote
                  </summary>
                  <div className="mt-2 rounded-md border border-line bg-subtle/60 p-3 sm:w-96">
                    <p className="text-sm text-ink-soft">
                      This awards the work to {q.contractor_name} for {formatCents(q.amount_cents)} and shares the site
                      address and contact with them.
                      {live > 1 ? ` The other ${live - 1} open ${live - 1 === 1 ? "quote is" : "quotes are"} declined.` : ""}
                    </p>
                    <ActionForm action={acceptAction} className="mt-3">
                      <input type="hidden" name="quoteId" value={q.id} />
                      <SubmitButton pendingLabel="Accepting…">Confirm and award</SubmitButton>
                    </ActionForm>
                  </div>
                </details>
                <details className="w-full sm:w-auto">
                  <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-md px-3.5 text-sm font-medium text-ink-soft ring-1 ring-inset ring-line-strong hover:bg-subtle sm:h-9 [&::-webkit-details-marker]:hidden">
                    Decline
                  </summary>
                  <ActionForm action={declineAction} className="mt-2 space-y-2 sm:w-96">
                    <input type="hidden" name="quoteId" value={q.id} />
                    <Input name="note" placeholder="Optional note for the contractor" aria-label="Note for the contractor" maxLength={1000} />
                    <SubmitButton variant="secondary" pendingLabel="Declining…">
                      Decline quote
                    </SubmitButton>
                  </ActionForm>
                </details>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
