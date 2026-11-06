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

const AVATAR_TONES = [
  "bg-[#fff1e8] text-[#9a3412]",
  "bg-[#e8f1fb] text-[#1e4f86]",
  "bg-[#e9f6ef] text-[#1d6b45]",
  "bg-[#f3eefc] text-[#5b3a9b]",
  "bg-[#fdf3dc] text-[#8a5a00]",
];

/** A business's initials on a tinted tile; the tint is stable for a given name. */
export function BusinessAvatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !["co", "co.", "inc", "inc.", "llc", "the", "and"].includes(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const tone = AVATAR_TONES[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  const box = size === "lg" ? "h-20 w-20 rounded-2xl text-[28px]" : "h-14 w-14 rounded-xl text-[19px]";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center font-bold tracking-[-0.02em] ${box} ${tone}`}
    >
      {initials || "Q"}
    </span>
  );
}

export function PublicContractorCard({ contractor: c }: { contractor: PublicContractor }) {
  const towns = c.areas.slice(0, 3).join(", ") + (c.areas.length > 3 ? ` +${c.areas.length - 3}` : "");
  const facts = [
    c.years_in_business ? `${c.years_in_business} yrs in business` : null,
    c.crew_size ? `Crew of ${c.crew_size}` : null,
  ].filter(Boolean);
  return (
    <Link
      href={`/contractors/${c.slug}`}
      className="group flex h-full flex-col rounded-2xl bg-surface p-5 ring-1 ring-line transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-20px_rgba(21,25,30,0.35)] hover:ring-line-strong sm:p-6"
      data-testid="public-contractor"
    >
      <div className="flex items-start gap-4">
        <BusinessAvatar name={c.name} />
        <div className="min-w-0 flex-1">
          <p className="text-[18px] leading-6 font-bold tracking-[-0.015em] text-ink">{c.name}</p>
          <p className="mt-0.5 text-[13.5px] text-muted">
            {c.city ? `${c.city}, NY` : c.market_name}
            {facts.length ? ` · ${facts.join(" · ")}` : ""}
          </p>
          <div className="mt-1.5">
            <RatingSummary rating={{ rating_avg: c.rating_avg, rating_count: c.rating_count }} />
          </div>
        </div>
      </div>
      {c.description ? (
        <p className="mt-4 line-clamp-2 text-[14.5px] leading-6 text-ink-soft">{c.description}</p>
      ) : null}
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {c.services.map((s) => (
          <li key={s} className="rounded-full bg-subtle px-2.5 py-1 text-[12.5px] font-medium text-ink-soft">
            {s}
          </li>
        ))}
      </ul>
      <div aria-hidden className="flex-1" />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[13px] text-muted">
        <div className="min-w-0 space-y-1">
          {towns ? <p>Serves {towns}</p> : null}
          {c.insurance_reviewed ? (
            <p className="flex items-center gap-1.5 text-ink-soft">
              <ReviewedMark className="h-3.5 w-3.5 text-ok" /> Liability certificate reviewed by QuickPro staff
            </p>
          ) : null}
        </div>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-soft px-3.5 text-[13.5px] font-semibold text-brand transition-colors group-hover:bg-brand group-hover:text-white">
          View profile <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}
