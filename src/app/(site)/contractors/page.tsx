import type { Metadata } from "next";
import Link from "next/link";
import { PublicContractorCard } from "@/components/marketing/public-contractors";
import { listPublicContractors, listPublicFilters } from "@/server/data/public-profiles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find contractors",
  description:
    "Construction, skilled-trade and commercial service businesses in Suffolk County, approved by QuickPro staff.",
};

export default async function PublicContractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; town?: string }>;
}) {
  const q = await searchParams;
  const filters = await listPublicFilters();
  // Only filter by a service or town that's in the lists; anything else in
  // the address is ignored, so the form always matches what's shown.
  const categoryName = filters.categories.find((c) => c.slug === q.category)?.name;
  const townName = filters.areas.find((a) => a.slug === q.town)?.name;
  const category = categoryName ? q.category : undefined;
  const town = townName ? q.town : undefined;
  const contractors = await listPublicContractors({ category, area: town });

  return (
    <div className="space-y-10">
      <div className="max-w-[44rem]">
        <p className="flex items-center gap-2 text-[12.5px] font-semibold tracking-[0.08em] text-signal-ink uppercase">
          <span aria-hidden className="h-[7px] w-[7px] bg-signal" />
          Find contractors
        </p>
        <h1 className="mt-5 font-display text-[36px] leading-[1.08] font-medium tracking-[-0.025em] text-balance sm:text-[50px]">
          Contractors and trade businesses on QuickPro
        </h1>
        <p className="mt-5 text-[17px] leading-8 text-ink-soft">
          Every business here was reviewed and approved by QuickPro staff and chose to publish its profile. Ratings come
          only from businesses that hired them through QuickPro.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-[6px] border border-ink/[0.1] bg-surface p-4 sm:flex-row sm:items-end"
        role="search"
      >
        <div className="flex-1">
          <label htmlFor="filter-service" className="text-[13px] font-medium text-ink">
            Service
          </label>
          <select
            id="filter-service"
            name="category"
            defaultValue={category ?? ""}
            className="mt-1.5 block h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-[15px] text-ink sm:h-10 sm:text-sm"
          >
            <option value="">Any service</option>
            {filters.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="filter-town" className="text-[13px] font-medium text-ink">
            Town
          </label>
          <select
            id="filter-town"
            name="town"
            defaultValue={town ?? ""}
            className="mt-1.5 block h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-[15px] text-ink sm:h-10 sm:text-sm"
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
          className="h-11 rounded-md bg-ink px-5 text-[15px] font-medium text-white hover:bg-charcoal sm:h-10 sm:text-sm"
        >
          Show contractors
        </button>
      </form>

      <section aria-labelledby="results">
        <h2 id="results" className="mb-4 text-[15px] font-medium text-ink-soft">
          {contractors.length} {contractors.length === 1 ? "business" : "businesses"}
          {categoryName ? ` for ${categoryName.toLowerCase()}` : ""}
          {townName ? ` in ${townName}` : ""}
        </h2>
        {contractors.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {contractors.map((c) => (
              <li key={c.slug}>
                <PublicContractorCard contractor={c} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-ink/15 px-6 py-12 text-center">
            <p className="font-medium text-ink">No published profiles match yet.</p>
            <p className="mt-1 text-[15px] text-ink-soft">
              Try another service or town, or{" "}
              <Link href="/contractors" className="underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
                see every business
              </Link>
              .
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
    <section className="rounded-2xl bg-charcoal px-6 py-8 text-white sm:px-10 sm:py-10">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">
        Need commercial service work done?
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-white/75">
        Create a customer account, describe the work and the site, and invite the businesses you like to quote. You
        compare quotes and award the work in QuickPro.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/sign-up?as=customer"
          className="inline-flex h-10 items-center rounded-md bg-white px-4 text-sm font-medium text-ink hover:bg-white/90"
        >
          Request a quote
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
