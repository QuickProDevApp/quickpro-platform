import Link from "next/link";
import { RatingSummary } from "@/components/app/trust";
import type { PublicContractor } from "@/server/data/public-profiles";

/** A shield with a check: a staff-reviewed document, not a guarantee. */
export function ReviewedMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.4}>
      <path
        d="M8 1.75 2.75 3.6v4.1c0 3.1 2.2 5.4 5.25 6.55 3.05-1.15 5.25-3.45 5.25-6.55V3.6L8 1.75Z"
        strokeLinejoin="round"
      />
      <path d="m5.6 8.1 1.7 1.7 3.1-3.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PublicContractorCard({ contractor: c }: { contractor: PublicContractor }) {
  const towns = c.areas.slice(0, 4).join(", ") + (c.areas.length > 4 ? ` and ${c.areas.length - 4} more` : "");
  return (
    <Link
      href={`/contractors/${c.slug}`}
      className="group flex h-full flex-col rounded-xl border border-ink/[0.08] bg-surface p-5 transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(21,25,30,0.25)]"
      data-testid="public-contractor"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink group-hover:underline group-hover:decoration-ink/25 group-hover:underline-offset-4">
            {c.name}
          </p>
          <p className="text-[13px] text-muted">{c.city ? `${c.city}, NY` : c.market_name}</p>
        </div>
        <RatingSummary rating={{ rating_avg: c.rating_avg, rating_count: c.rating_count }} compact />
      </div>
      {c.description ? <p className="mt-3 line-clamp-3 text-[14px] leading-6 text-ink-soft">{c.description}</p> : null}
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Services">
        {c.services.map((s) => (
          <li key={s} className="rounded-md bg-subtle px-2 py-0.5 text-[12px] font-medium text-ink-soft">
            {s}
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-1 pt-4 text-[13px] text-muted">
        {towns ? <p>Serves {towns}</p> : null}
        {c.insurance_reviewed ? (
          <p className="flex items-center gap-1.5 text-ink-soft">
            <ReviewedMark className="h-3.5 w-3.5 text-ok" /> Liability certificate reviewed by QuickPro staff
          </p>
        ) : null}
      </div>
    </Link>
  );
}
