import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Presentation tour" };

const SCREENS = [
  { n: 1, title: "Homepage", body: "Search by service and town, popular trades, and how QuickPro works for each side.", href: "/", cta: "Open the homepage" },
  { n: 2, title: "Find a pro", body: "Filter Suffolk County businesses by trade and town. Ratings come from finished projects.", href: "/contractors", cta: "Search contractors" },
  { n: 3, title: "Contractor profile", body: "Stats, services, towns served, reviews and a quote request that stays in reach.", href: "/contractors/bayview-build-co", cta: "View a profile" },
  { n: 4, title: "Post a project", body: "Describe the work, timing, budget and site in three steps. Matched contractors quote.", href: "/showcase/post-a-project", cta: "Post a project" },
] as const;

const DASHBOARDS = [
  { title: "Contractor", body: "Requests to quote, projects in progress, crew jobs and subcontract offers.", href: "/showcase/dashboard/contractor" },
  { title: "Customer", body: "Active requests, quotes to compare and invoices to pay.", href: "/showcase/dashboard/customer" },
  { title: "Worker", body: "Booked shifts, offers to answer and pay at a glance.", href: "/showcase/dashboard/worker" },
] as const;

/** The index of the presentation preview (D-047). */
export default function ShowcaseTour() {
  return (
    <div className="-mt-6 space-y-10 sm:-mt-10">
      <div className="max-w-[46rem]">
        <p className="text-[13px] font-semibold tracking-[0.06em] text-brand uppercase">Presentation tour</p>
        <h1 className="mt-3 font-display text-[34px] leading-[1.08] font-bold tracking-[-0.03em] text-balance sm:text-[46px]">
          See QuickPro, screen by screen
        </h1>
        <p className="mt-4 text-[17px] leading-7 text-ink-soft">
          This preview runs on sample businesses, people and projects. Nothing you enter is saved, nobody signs in, and no
          payments are taken. The full app, with accounts, quotes, crews, timesheets and invoices, runs on the same
          screens.
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SCREENS.map((s) => (
          <li key={s.n}>
            <Link
              href={s.href}
              className="group flex h-full flex-col rounded-2xl bg-surface p-6 ring-1 ring-line transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-20px_rgba(21,25,30,0.35)] hover:ring-line-strong"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[14px] font-bold text-white">
                {s.n}
              </span>
              <span className="mt-4 text-[19px] font-bold tracking-[-0.015em] text-ink">{s.title}</span>
              <span className="mt-1.5 flex-1 text-[15px] leading-6 text-ink-soft">{s.body}</span>
              <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand">
                {s.cta} <span aria-hidden>→</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <section aria-labelledby="dashboards" className="on-dark rounded-2xl bg-charcoal p-6 text-white sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[14px] font-bold text-ink">5</span>
          <h2 id="dashboards" className="text-[21px] font-bold tracking-[-0.02em]">
            Dashboards
          </h2>
        </div>
        <ul className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {DASHBOARDS.map((d) => (
            <li key={d.title}>
              <Link href={d.href} className="flex h-full flex-col rounded-xl bg-white/[0.06] p-5 ring-1 ring-white/10 transition-colors hover:bg-white/[0.1]">
                <span className="text-[16px] font-semibold">{d.title}</span>
                <span className="mt-1 flex-1 text-[14px] leading-6 text-white/70">{d.body}</span>
                <span className="mt-4 text-[14px] font-semibold text-[#f6884a]">
                  Open <span aria-hidden>→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
