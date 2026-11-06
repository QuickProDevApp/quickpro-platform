import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stars } from "@/components/app/trust";
import { BusinessAvatar, ReviewedMark } from "@/components/marketing/public-contractors";
import { ServiceIcon } from "@/components/marketing/service-icon";
import { SERVICES } from "@/lib/catalog";
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
  const avg = c.rating_avg !== null && c.rating_count > 0 ? Number(c.rating_avg) : null;
  // The breakdown counts only the reviews shown on this page.
  const breakdown = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => r.rating === n).length }));

  const stats = [
    { label: "Projects through QuickPro", value: String(c.completed_projects) },
    c.years_in_business != null ? { label: "Years in business", value: String(c.years_in_business) } : null,
    c.crew_size != null
      ? { label: c.crew_size === 1 ? "Person on the crew" : "People on the crew", value: String(c.crew_size) }
      : null,
    { label: "Approved on QuickPro", value: asMonth(c.on_quickpro_since) },
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <article className="-mt-6 sm:-mt-10">
      <Link
        href="/contractors"
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink"
      >
        <span aria-hidden>←</span> All contractors
      </Link>

      {/* Header card */}
      <header className="mt-4 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        <div aria-hidden className="h-20 bg-[linear-gradient(120deg,#15191e_0%,#2a2f36_55%,#c2410c_140%)] sm:h-28" />
        <div className="px-5 pb-6 sm:px-8 sm:pb-8">
          <span className="-mt-10 inline-flex rounded-[20px] bg-surface p-1 shadow-[0_6px_18px_-8px_rgba(21,25,30,0.35)] sm:-mt-12">
            <BusinessAvatar name={c.name} size="lg" />
          </span>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="min-w-0">
                <h1 className="font-display text-[28px] leading-[1.1] font-bold tracking-[-0.03em] text-balance sm:text-[38px]">
                  {c.name}
                </h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <PinIcon /> {c.city ? `${c.city}, NY` : c.market_name}
                  </span>
                  {avg !== null ? (
                    <span className="inline-flex items-center gap-1.5" data-testid="rating">
                      <Stars rating={avg} className="h-4 w-4" />
                      <span className="font-semibold text-ink tabular">{avg.toFixed(1)}</span>
                      <a href="#reviews" className="text-muted underline-offset-4 hover:underline">
                        {c.rating_count} {c.rating_count === 1 ? "review" : "reviews"}
                      </a>
                    </span>
                  ) : (
                    <span className="text-[14px] text-muted">No reviews yet</span>
                  )}
                </p>
              </div>
            </div>
            <Link
              href="/sign-up?as=customer"
              className="hidden h-11 shrink-0 items-center justify-center rounded-xl bg-brand px-5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong sm:inline-flex"
            >
              Request a quote
            </Link>
          </div>

          <div
            className="mt-5 flex items-start gap-2.5 rounded-xl bg-subtle px-4 py-3 text-[14px] leading-6 text-ink-soft"
            data-testid="insurance-note"
          >
            {c.insurance_reviewed ? (
              <>
                <ReviewedMark className="mt-1 h-4 w-4 shrink-0 text-ok" />
                <span>
                  <span className="font-semibold text-ink">Liability certificate on file.</span> A current general
                  liability certificate was reviewed by QuickPro staff. Ask the business for coverage details for your
                  site.
                </span>
              </>
            ) : (
              <span className="text-muted">No current liability certificate reviewed by QuickPro staff right now.</span>
            )}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-surface px-4 py-3.5">
                <dt className="text-[12.5px] text-muted">{s.label}</dt>
                <dd className="mt-0.5 text-[19px] font-bold tracking-[-0.01em] text-ink tabular">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-10">
          {c.description ? (
            <section aria-labelledby="about">
              <h2 id="about" className="text-[20px] font-bold tracking-[-0.015em] text-ink">
                About
              </h2>
              <p className="mt-3 text-[16px] leading-7 whitespace-pre-line text-ink-soft">{c.description}</p>
            </section>
          ) : null}

          <section aria-labelledby="services">
            <h2 id="services" className="text-[20px] font-bold tracking-[-0.015em] text-ink">
              Services
            </h2>
            {c.services.length ? (
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {c.services.map((name) => {
                  const sv = SERVICES.find((s) => s.name === name);
                  return (
                    <li key={name} className="flex items-start gap-3 rounded-xl bg-surface p-4 ring-1 ring-line">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        {sv ? <ServiceIcon slug={sv.slug} className="h-5 w-5" /> : <span aria-hidden>•</span>}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-ink">{name}</p>
                        {sv ? <p className="mt-0.5 text-[13.5px] leading-5 text-muted">{sv.blurb}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-[15px] text-muted">Not listed.</p>
            )}
          </section>

          <section aria-labelledby="areas">
            <h2 id="areas" className="text-[20px] font-bold tracking-[-0.015em] text-ink">
              Towns served
            </h2>
            {c.areas.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {c.areas.map((a) => (
                  <li
                    key={a}
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13.5px] font-medium text-ink-soft ring-1 ring-line"
                  >
                    <PinIcon /> {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[15px] text-muted">Not listed.</p>
            )}
          </section>

          <section aria-labelledby="reviews" className="scroll-mt-24">
            <h2 id="reviews" className="text-[20px] font-bold tracking-[-0.015em] text-ink">
              Reviews
            </h2>
            <p className="mt-1 text-[14px] text-muted">
              From businesses that hired {c.name} through QuickPro, shown once both sides have reviewed each other.
            </p>

            {reviews.length ? (
              <>
                <div className="mt-4 flex flex-col gap-5 rounded-2xl bg-surface p-5 ring-1 ring-line sm:flex-row sm:items-center sm:gap-8 sm:p-6">
                  <div className="shrink-0">
                    <p className="text-[44px] leading-none font-bold tracking-[-0.03em] text-ink tabular">
                      {avg !== null ? avg.toFixed(1) : "–"}
                    </p>
                    {avg !== null ? <Stars rating={avg} className="mt-2 h-4 w-4" /> : null}
                    <p className="mt-1 text-[13px] text-muted">
                      {c.rating_count} {c.rating_count === 1 ? "review" : "reviews"}
                    </p>
                  </div>
                  <ul className="flex-1 space-y-1.5" aria-label="Ratings on this page">
                    {breakdown.map((b) => (
                      <li key={b.n} className="flex items-center gap-3 text-[13px] text-muted">
                        <span className="w-10 tabular">{b.n} star</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                          <span
                            className="block h-full rounded-full bg-amber-500"
                            style={{ width: `${(b.count / reviews.length) * 100}%` }}
                          />
                        </span>
                        <span className="w-4 text-right tabular">{b.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <ul className="mt-4 space-y-3">
                  {reviews.map((r, i) => (
                    <li
                      key={i}
                      className="rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-6"
                      data-testid="public-review"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-subtle text-[13px] font-semibold text-ink-soft"
                          >
                            {r.reviewer.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <p className="text-[14px] font-semibold text-ink">
                              {r.reviewer}
                              {r.area_name ? <span className="font-normal text-muted"> in {r.area_name}</span> : null}
                            </p>
                            <p className="text-[12.5px] text-muted">{formatDate(r.reviewed_on)}</p>
                          </div>
                        </div>
                        <Stars rating={r.rating} />
                      </div>
                      {r.body ? (
                        <p className="mt-3 text-[15px] leading-7 whitespace-pre-line text-ink">{r.body}</p>
                      ) : null}
                      {r.reply ? (
                        <p className="mt-3 rounded-lg bg-subtle px-4 py-3 text-[14px] leading-6 text-ink-soft">
                          <span className="font-semibold text-ink">Reply from {c.name}:</span> {r.reply}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-[15px] text-ink-soft">
                No reviews yet.
              </p>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-surface p-5 shadow-[0_1px_2px_rgba(21,25,30,0.06),0_18px_40px_-26px_rgba(21,25,30,0.35)] ring-1 ring-line sm:p-6">
            <p className="text-[18px] font-bold tracking-[-0.015em] text-ink">Get a quote from {c.name}</p>
            <ol className="mt-4 space-y-3 text-[14px] leading-6 text-ink-soft">
              {[
                "Create a free customer account.",
                "Post your project: the work, the site and your timing.",
                `Invite ${c.name} to quote, then compare and award in QuickPro.`,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <Link
              href="/sign-up?as=customer"
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              Request a quote
            </Link>
            <Link href="/sign-in?next=/app" className="mt-3 block text-center text-[13.5px] text-muted hover:text-ink">
              Already on QuickPro? Log in
            </Link>
          </div>
        </aside>
      </div>

      {/* Phone: the quote button stays in reach. */}
      <div className="sticky bottom-0 z-30 -mx-5 mt-8 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:hidden">
        <Link
          href="/sign-up?as=customer"
          className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[15px] font-semibold text-white hover:bg-brand-strong"
        >
          Request a quote
        </Link>
      </div>
    </article>
  );
}

function PinIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 text-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14Z" strokeLinejoin="round" />
      <circle cx="8" cy="6.5" r="1.6" />
    </svg>
  );
}
