import { Logo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/button";

const flow = [
  { title: "Post the job", body: "Town, shift, headcount, pay and the skills you need. The street address stays private until someone is booked." },
  { title: "Approved local workers apply", body: "Approved workers who cover the job's town see it in their feed. You see each applicant's skills and home town." },
  { title: "Offer, confirm, coordinate", body: "Offer the job, get a yes, and message the crew about parking, gear and timing in one thread." },
  { title: "Check in on site", body: "Workers check in and out on their phones. You see who is on site and when." },
];

const audiences = [
  {
    label: "Contractors",
    title: "Say yes to bigger jobs",
    body: "Register your business, list the towns you cover, and staff jobs with reviewed local workers when your crew is stretched.",
    cta: { href: "/sign-up?as=contractor", label: "Register your business" },
  },
  {
    label: "Workers",
    title: "Find shifts near home",
    body: "Build a profile once, see open jobs in your towns with pay up front, and keep your schedule in one place.",
    cta: { href: "/sign-up?as=worker", label: "Create a worker profile" },
  },
  {
    label: "Property and facility managers",
    title: "Request service and compare quotes",
    body: "Describe the work once. Reviewed contractors who serve your town send prices, and you choose who gets the job.",
    cta: { href: "/sign-up?as=customer", label: "Register a property" },
  },
];

const checks = [
  "QuickPro staff review every business before it can post work, including its general liability certificate.",
  "Every worker profile is reviewed before the worker can apply.",
  "Pay is shown before anyone applies, and never below the market's minimum hourly rate.",
  "Every change to a job, booking and review is recorded in an audit log.",
];

const categories = ["Commercial cleaning", "Pressure washing", "Landscaping", "Facility services"];

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1.5">
            <LinkButton href="/sign-in" variant="ghost">
              Sign in
            </LinkButton>
            <LinkButton href="/sign-up">Get started</LinkButton>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-14 pb-16 sm:px-6 md:pt-24 md:pb-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            <div>
              <p className="inline-flex items-center gap-2 rounded-md bg-subtle px-2 py-1 text-xs font-medium text-ink-soft ring-1 ring-inset ring-line">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
                Now onboarding in Suffolk County, NY
              </p>
              <h1 className="mt-6 max-w-xl text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[56px]">
                Staff and run commercial service work, from one place.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-7 text-ink-soft">
                QuickPro connects Long Island service contractors with reviewed local workers, and gives both sides the
                tools to fill, coordinate and complete every job.
              </p>
              <div className="mt-8 flex flex-wrap gap-2.5">
                <LinkButton href="/sign-up?as=contractor" className="sm:h-10 sm:px-4">
                  Register your business
                </LinkButton>
                <LinkButton href="/sign-up?as=worker" variant="secondary" className="sm:h-10 sm:px-4">
                  Find local work
                </LinkButton>
              </div>
              <p className="mt-6 text-sm text-muted">
                Launch categories: {categories.join(", ")}.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-2">
              <div className="rounded-lg border border-line bg-surface">
                <p className="border-b border-line px-5 py-3 text-xs font-medium tracking-wide text-muted uppercase">How a job runs</p>
                <ol className="px-5 py-2">
                  {flow.map((step, i) => (
                    <li key={step.title} className="relative flex gap-4 py-3.5">
                      {i < flow.length - 1 ? <span aria-hidden className="absolute top-10 bottom-0 left-[11px] w-px bg-line" /> : null}
                      <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-xs font-semibold text-ink">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink">{step.title}</p>
                        <p className="mt-0.5 text-sm leading-6 text-muted">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
            {audiences.map((a) => (
              <div key={a.label} className="flex flex-col bg-surface p-6 sm:p-7">
                <p className="text-xs font-medium tracking-wide text-muted uppercase">{a.label}</p>
                <h2 className="mt-3 text-lg font-semibold tracking-[-0.01em] text-ink">{a.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-muted">{a.body}</p>
                <a href={a.cta.href} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-strong">
                  {a.cta.label} <span aria-hidden>→</span>
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line bg-canvas">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.4fr] md:py-20">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Built for trust on both sides</h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
                QuickPro is in early access in Suffolk County. These are the rules the platform enforces today.
              </p>
            </div>
            <ul className="divide-y divide-line border-y border-line">
              {checks.map((c) => (
                <li key={c} className="flex gap-3 py-4 text-sm leading-6 text-ink-soft">
                  <svg aria-hidden viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0 text-ok" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted sm:px-6">
          <span>© {new Date().getFullYear()} QuickPro · Suffolk County, NY</span>
          <a href="/sign-in" className="hover:text-ink">
            Sign in
          </a>
        </div>
      </footer>
    </div>
  );
}
