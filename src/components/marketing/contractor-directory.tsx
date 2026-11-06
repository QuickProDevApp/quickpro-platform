import Link from "next/link";
import { PublicContractorCard } from "@/components/marketing/public-contractors";
import { ServiceIcon } from "@/components/marketing/service-icon";
import { SERVICES } from "@/lib/catalog";
import type { PublicContractor } from "@/server/data/public-profiles";

type Option = { slug: string; name: string };

/**
 * The public contractor directory: search, trade chips and results. The
 * page passes in what it read from the database; the presentation preview
 * (D-047) passes in its labeled sample businesses.
 */
export function ContractorDirectory({
  filters,
  contractors,
  category,
  town,
  categoryName,
  townName,
}: {
  filters: { categories: Option[]; areas: Option[] };
  contractors: PublicContractor[];
  category: string | undefined;
  town: string | undefined;
  categoryName: string | undefined;
  townName: string | undefined;
}) {
  const filterHref = (slug: string | undefined) => {
    const params = new URLSearchParams();
    if (slug) params.set("category", slug);
    if (town) params.set("town", town);
    const q = params.toString();
    return q ? `/contractors?${q}` : "/contractors";
  };

  return (
    <div className="space-y-8">
      <div className="max-w-[46rem]">
        <p className="text-[13px] font-semibold tracking-[0.06em] text-brand uppercase">Find a pro</p>
        <h1 className="mt-3 font-display text-[34px] leading-[1.08] font-bold tracking-[-0.03em] text-balance sm:text-[46px]">
          Contractors and trade businesses on QuickPro
        </h1>
        <p className="mt-4 text-[17px] leading-7 text-ink-soft">
          Every business here was reviewed and approved by QuickPro staff and chose to publish its profile. Ratings come
          only from businesses that hired them through QuickPro.
        </p>
      </div>

      <form
        method="get"
        role="search"
        className="rounded-2xl bg-surface p-3 shadow-[0_1px_2px_rgba(21,25,30,0.06),0_16px_40px_-24px_rgba(21,25,30,0.25)] ring-1 ring-line"
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
          <div className="rounded-xl px-3 py-2 transition-colors focus-within:bg-subtle hover:bg-subtle">
            <label htmlFor="filter-service" className="block text-[12px] font-semibold text-ink">
              Service
            </label>
            <select
              id="filter-service"
              name="category"
              defaultValue={category ?? ""}
              className="mt-0.5 block w-full cursor-pointer bg-transparent text-[15px] text-ink-soft outline-none"
            >
              <option value="">Any service</option>
              {filters.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl px-3 py-2 transition-colors focus-within:bg-subtle hover:bg-subtle sm:border-l sm:border-line">
            <label htmlFor="filter-town" className="block text-[12px] font-semibold text-ink">
              Town
            </label>
            <select
              id="filter-town"
              name="town"
              defaultValue={town ?? ""}
              className="mt-0.5 block w-full cursor-pointer bg-transparent text-[15px] text-ink-soft outline-none"
            >
              <option value="">Any town</option>
              {filters.areas.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong sm:h-auto"
          >
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.2 13.2 3.3 3.3" strokeLinecap="round" />
            </svg>
            Show contractors
          </button>
        </div>
      </form>

      <nav
        aria-label="Trade categories"
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
      >
        <Link
          href={filterHref(undefined)}
          aria-current={!category ? "page" : undefined}
          className={`shrink-0 rounded-full px-3.5 py-2 text-[13.5px] font-medium ring-1 transition-colors ${
            !category
              ? "bg-ink text-white ring-ink"
              : "bg-surface text-ink-soft ring-line hover:text-ink hover:ring-line-strong"
          }`}
        >
          All services
        </Link>
        {SERVICES.map((sv) => {
          const active = category === sv.slug;
          return (
            <Link
              key={sv.slug}
              href={filterHref(sv.slug)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] font-medium ring-1 transition-colors ${
                active
                  ? "bg-ink text-white ring-ink"
                  : "bg-surface text-ink-soft ring-line hover:text-ink hover:ring-line-strong"
              }`}
            >
              <ServiceIcon slug={sv.slug} className="h-4 w-4" />
              {sv.name}
            </Link>
          );
        })}
      </nav>

      <section aria-labelledby="results">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="results" className="text-[18px] font-bold tracking-[-0.01em] text-ink">
            {contractors.length} {contractors.length === 1 ? "business" : "businesses"}
            {categoryName ? ` for ${categoryName.toLowerCase()}` : ""}
            {townName ? ` in ${townName}` : ""}
          </h2>
          <p className="text-[13px] text-muted">Approved by QuickPro staff · Suffolk County, NY</p>
        </div>
        {contractors.length ? (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {contractors.map((c) => (
              <li key={c.slug}>
                <PublicContractorCard contractor={c} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <p className="text-[17px] font-semibold text-ink">No published profiles match yet.</p>
            <p className="mt-1 text-[15px] text-ink-soft">
              Try another service or town, or{" "}
              <Link href="/contractors" className="font-medium text-brand underline-offset-4 hover:underline">
                see every business
              </Link>
              . You can also post the project and invite businesses to quote.
            </p>
          </div>
        )}
      </section>

      <CustomerCallToAction />
    </div>
  );
}
function CustomerCallToAction() {
  return (
    <section className="on-dark rounded-2xl bg-charcoal px-6 py-8 text-white sm:px-10 sm:py-10">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">Have a project in mind?</h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-white/75">
        Create a customer account, describe the work and the site, and invite the businesses you like to quote. You
        compare quotes and award the work in QuickPro.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/sign-up?as=customer"
          className="inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          Post a project
        </Link>
        <Link
          href="/sign-up?as=contractor"
          className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-white ring-1 ring-white/30 hover:bg-white/10"
        >
          List your business
        </Link>
      </div>
    </section>
  );
}
