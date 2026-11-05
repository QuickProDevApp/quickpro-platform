import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingSummary, Stars } from "@/components/app/trust";
import { ReviewedMark } from "@/components/marketing/public-contractors";
import { formatDate } from "@/lib/labels";
import { publicSlug } from "@/lib/schemas";
import { getPublicContractor, listPublicContractorReviews } from "@/server/data/public-profiles";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!publicSlug.safeParse(slug).success) return null;
  return getPublicContractor(slug);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = await load((await params).slug);
  if (!c) return { title: "Contractor not found" };
  return {
    title: c.name,
    description: `${c.name}: ${c.services.join(", ")} in ${c.areas.slice(0, 5).join(", ") || c.market_name}. Approved by QuickPro staff.`,
  };
}

const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const asMonth = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return monthYear.format(Date.UTC(y, m - 1, 1));
};

export default async function PublicContractorPage({ params }: Params) {
  const c = await load((await params).slug);
  if (!c) notFound();
  const reviews = await listPublicContractorReviews(c.slug);

  const facts = [
    { label: "Services", value: c.services.join(", ") || "Not listed" },
    { label: "Towns served", value: c.areas.join(", ") || "Not listed" },
    c.years_in_business != null ? { label: "Years in business", value: String(c.years_in_business) } : null,
    c.crew_size != null
      ? { label: "Crew size", value: `${c.crew_size} ${c.crew_size === 1 ? "person" : "people"}` }
      : null,
    { label: "Approved on QuickPro", value: asMonth(c.on_quickpro_since) },
    { label: "Projects completed through QuickPro", value: String(c.completed_projects) },
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <article className="space-y-10">
      <div>
        <Link href="/contractors" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
          <span aria-hidden>←</span> All contractors
        </Link>
        <h1 className="mt-4 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[44px]">
          {c.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-ink-soft">
          <span>{c.city ? `${c.city}, NY` : c.market_name}</span>
          <RatingSummary rating={{ rating_avg: c.rating_avg, rating_count: c.rating_count }} />
        </div>
        <p className="mt-3 flex items-start gap-2 text-[14px] text-ink-soft" data-testid="insurance-note">
          {c.insurance_reviewed ? (
            <>
              <ReviewedMark className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              <span>
                A current general liability certificate is on file and was reviewed by QuickPro staff. Ask the business
                for coverage details for your site.
              </span>
            </>
          ) : (
            <span className="text-muted">No current liability certificate reviewed by QuickPro staff right now.</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          {c.description ? (
            <section aria-labelledby="about">
              <h2 id="about" className="text-[19px] font-semibold tracking-[-0.01em] text-ink">
                About
              </h2>
              <p className="mt-2 text-[16px] leading-7 whitespace-pre-line text-ink-soft">{c.description}</p>
            </section>
          ) : null}

          <section aria-labelledby="reviews">
            <h2 id="reviews" className="text-[19px] font-semibold tracking-[-0.01em] text-ink">
              Reviews
            </h2>
            <p className="mt-1 text-[14px] text-muted">
              From businesses that hired {c.name} through QuickPro, shown once both sides have reviewed each other.
            </p>
            {reviews.length ? (
              <ul className="mt-4 space-y-3">
                {reviews.map((r, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-ink/[0.08] bg-surface p-4 sm:p-5"
                    data-testid="public-review"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Stars rating={r.rating} />
                      <span className="text-[13px] text-muted">
                        {r.reviewer}
                        {r.area_name ? ` in ${r.area_name}` : ""} · {formatDate(r.reviewed_on)}
                      </span>
                    </div>
                    {r.body ? (
                      <p className="mt-2 text-[15px] leading-7 whitespace-pre-line text-ink">{r.body}</p>
                    ) : null}
                    {r.reply ? (
                      <p className="mt-3 border-l-2 border-line-strong pl-3 text-[14px] leading-6 text-ink-soft">
                        <span className="font-medium text-ink">Reply from {c.name}:</span> {r.reply}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-ink/15 px-5 py-6 text-[15px] text-ink-soft">
                No reviews yet.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <dl className="divide-y divide-ink/[0.06] rounded-xl border border-ink/[0.08] bg-surface">
            {facts.map((f) => (
              <div key={f.label} className="px-5 py-3">
                <dt className="text-[12px] font-medium tracking-wide text-faint uppercase">{f.label}</dt>
                <dd className="mt-0.5 text-[15px] text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-xl bg-charcoal p-5 text-white">
            <p className="text-[17px] font-semibold">Want a quote from {c.name}?</p>
            <p className="mt-1.5 text-[14px] leading-6 text-white/75">
              Create a customer account, post your request, and invite {c.name} to quote from the contractor directory.
            </p>
            <Link
              href="/sign-up?as=customer"
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-white text-sm font-medium text-ink hover:bg-white/90"
            >
              Request a quote
            </Link>
            <Link
              href="/sign-in?next=/app"
              className="mt-2 block text-center text-[13px] text-white/75 hover:text-white"
            >
              Already on QuickPro? Log in
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}
