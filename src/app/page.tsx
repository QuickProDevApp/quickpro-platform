import type { Metadata } from "next";
import Link from "next/link";
import { FeatureTabs, type Feature } from "@/components/marketing/feature-tabs";
import { PhoneFrame, ScreenFrame } from "@/components/marketing/frames";
import { Reveal } from "@/components/marketing/reveal";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { ServiceIcon } from "@/components/marketing/service-icon";
import { SERVICES, TOWNS } from "@/lib/catalog";

export const metadata: Metadata = {
  title: { absolute: "QuickPro · Hire contractors and skilled crews" },
  description:
    "Find approved contractors and skilled trades in Suffolk County, NY. Post a project, compare quotes, hire, track the work and pay in one place. Contractors staff jobs with subcontractors and local tradespeople on the same platform.",
};

// Product screens captured from the running app with the labeled demo data set (scripts/demo-seed.mts, .review/marketing-shots.mts).
const desk = { width: 2560, height: 1720 };
const phone = { width: 1170, height: 1992, phone: true };
const shots = {
  quotes: { src: "/marketing/hero-quotes.webp", ...desk },
  questions: { src: "/marketing/customer-questions.webp", ...desk },
  invoice: { src: "/marketing/customer-invoice.webp", ...desk },
  paid: { src: "/marketing/customer-paid.webp", ...desk },
  overview: { src: "/marketing/contractor-overview.webp", ...desk },
  project: { src: "/marketing/contractor-project.webp", ...desk },
  crew: { src: "/marketing/contractor-crew.webp", ...desk },
  subcontract: { src: "/marketing/contractor-subcontract.webp", ...desk },
  timesheets: { src: "/marketing/contractor-timesheets.webp", ...desk },
  workerFind: { src: "/marketing/worker-find.webp", ...phone },
  workerOffer: { src: "/marketing/worker-offer.webp", ...phone },
  workerHours: { src: "/marketing/worker-hours.webp", ...phone },
};

const roles = [
  {
    key: "customers",
    who: "Property owners and managers",
    steps: ["Post your project with the scope, town, dates and budget", "Answer private questions and compare quotes side by side", "Hire one contractor and follow the work on one page", "Confirm it's done and pay the invoice by card or check"],
    href: "/sign-up?as=customer",
    cta: "Post a project",
  },
  {
    key: "contractors",
    who: "Contractors and subcontractors",
    steps: ["Get requests for the trades and towns you list", "Ask questions, then send your quote", "Staff the work with your crew, subcontractors and local tradespeople", "Approve hours, then invoice and get paid to your account"],
    href: "/sign-up?as=contractor",
    cta: "Join as a contractor",
  },
  {
    key: "workers",
    who: "Tradespeople and crew",
    steps: ["Build a skills profile and choose your towns", "Set the days you're available", "Apply to local shifts with the pay shown up front", "Accept offers, check in on site and see your approved hours"],
    href: "/sign-up?as=worker",
    cta: "Find shift work",
  },
];

const popular = ["carpentry", "painting-drywall", "flooring", "general-construction", "commercial-cleaning"] as const;

const contractorFeatures: Feature[] = [
  {
    key: "opportunities",
    label: "Opportunities",
    title: "Requests that match your trades and towns",
    body: "Customer requests for the services and towns you list come to your overview. Ask the customer a question privately, then quote.",
    points: ["Only requests you can do, where you work", "Private questions before you price it", "Revise or withdraw until the customer decides", "Projects, jobs and subcontracts in one overview"],
    image: { ...shots.overview, alt: "A general contractor's overview with a project in progress, upcoming jobs and a reviewed insurance certificate" },
  },
  {
    key: "project",
    label: "Project board",
    title: "Every project from award to confirmation",
    body: "Progress, scheduled work, who checked in, the checklist, subcontractors and the history, on one page the customer sees its own side of.",
    points: ["Progress from awarded to confirmed", "Jobs with booked crew and check-in times", "Project thread with the customer", "Report the work complete when it's done"],
    image: { ...shots.project, alt: "A project board showing progress, three jobs with booked workers and a checklist" },
  },
  {
    key: "crew",
    label: "Crew and shifts",
    title: "Book reviewed tradespeople by the shift",
    body: "Post a shift with the pay, hours and skills. Approved workers nearby apply; offer it to the ones who fit and they accept from their phones.",
    points: ["Skill match and home town on every applicant", "Pay shown before anyone applies", "Address shared once someone is booked", "Your own crew and QuickPro workers on one job"],
    image: { ...shots.crew, alt: "A demolition shift with two booked workers, their skills and check-in times" },
  },
  {
    key: "subcontractors",
    label: "Subcontractors",
    title: "Hand off part of the work",
    body: "Offer a scope and price to an approved subcontractor. They schedule and staff their own jobs on your project; the customer never sees your price with them.",
    points: ["Scope and agreed price on record", "Their own thread with you", "They report their part complete to you", "Only approved, insured businesses"],
    image: { ...shots.subcontract, alt: "A drywall subcontract on a lobby project, with the agreed scope, price and the subcontractor's own job" },
  },
  {
    key: "timesheets",
    label: "Timesheets",
    title: "Approve hours from check-in and check-out",
    body: "Each finished shift shows when the worker checked in and out. Approve as recorded or adjust with a note the worker sees, then export for payroll.",
    points: ["Hours from check-in and check-out", "Adjustments need a note", "Workers can question hours", "Export approved hours as CSV"],
    image: { ...shots.timesheets, alt: "A week of timesheets with approved hours, one shift waiting for approval, and gross pay" },
  },
  {
    key: "invoices",
    label: "Invoices and payment",
    title: "Bill the customer, get paid to your account",
    body: "Issue the invoice from the project. Customers pay by card through Stripe, straight to your connected account, or by check and you mark it paid.",
    points: ["Line items, due date and payment instructions", "Card payments through Stripe Connect", "QuickPro never holds the money", "Card payments run in test mode until launch"],
    image: { ...shots.paid, alt: "A stairwell repaint invoice marked paid by card through Stripe, in test mode" },
  },
];

const today = [
  "QuickPro staff review every business before it can post work or quote. Contractors need a reviewed, current general liability certificate.",
  "Every worker profile is reviewed by staff before the worker can apply.",
  "Pay is shown before anyone applies and can't be set below the market's minimum hourly rate.",
  "Site addresses and contacts go only to the awarded contractor and the booked crew.",
  "Questions before the award are private between the customer and each contractor.",
  "Hours come from the worker's check-in and check-out. The business approves them; the worker can question them.",
  "Card payments go through Stripe Connect straight to the contractor. QuickPro never holds the money.",
  "Changes to jobs, bookings, quotes, hours and invoices are recorded in an audit log.",
];

const notYet = [
  "Trade license checks. Electrical, plumbing and HVAC aren't offered until they exist.",
  "Identity verification and background checks",
  "Text message alerts",
  "ACH payments and card refunds in QuickPro",
  "Live card payments (test mode until launch)",
];

function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <p className={`text-[13px] font-semibold tracking-[0.06em] uppercase ${onDark ? "text-[#f6884a]" : "text-brand"}`}>{children}</p>
  );
}

function SectionHeading({ eyebrow, title, body, onDark = false }: { eyebrow: string; title: string; body?: string; onDark?: boolean }) {
  return (
    <Reveal className="max-w-[44rem]">
      <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow>
      <h2
        className={`mt-3 font-display text-[32px] leading-[1.1] font-bold tracking-[-0.03em] text-balance sm:text-[44px] ${onDark ? "text-white" : "text-ink"}`}
      >
        {title}
      </h2>
      {body ? <p className={`mt-4 text-[17px] leading-7 text-pretty ${onDark ? "text-white/70" : "text-ink-soft"}`}>{body}</p> : null}
    </Reveal>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(194,65,12,0.2)] transition-colors hover:bg-brand-strong"
    >
      {children}
      <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

function SecondaryLink({ href, children, onDark = false }: { href: string; children: React.ReactNode; onDark?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-12 items-center justify-center rounded-lg px-5 text-[15px] font-semibold ring-1 transition-colors ring-inset ${
        onDark ? "text-white ring-white/30 hover:bg-white/[0.08]" : "bg-surface text-ink ring-line-strong hover:bg-subtle"
      }`}
    >
      {children}
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col bg-surface text-ink">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero: find a pro */}
        <section className="relative overflow-hidden border-b border-line bg-canvas">
          <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-5 pt-12 pb-14 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:pt-20 lg:pb-20">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[13px] font-medium text-ink-soft ring-1 ring-line">
                <span aria-hidden className="h-2 w-2 rounded-full bg-signal" />
                Now onboarding in Suffolk County, NY
              </p>
              <h1 className="mt-5 font-display text-[42px] leading-[1.02] font-bold tracking-[-0.035em] text-balance text-ink sm:text-[58px] lg:text-[64px]">
                Hire contractors and skilled crews for any job.
              </h1>
              <p className="mt-5 max-w-[34rem] text-[18px] leading-8 text-pretty text-ink-soft">
                Compare quotes from approved local businesses, hire with confidence, and manage the work through to payment.
                Contractors staff it with subcontractors and tradespeople on the same platform.
              </p>

              <form
                action="/contractors"
                method="get"
                role="search"
                aria-label="Find a pro"
                className="mt-8 rounded-2xl bg-surface p-3 shadow-[0_1px_2px_rgba(21,25,30,0.06),0_16px_40px_-20px_rgba(21,25,30,0.25)] ring-1 ring-line"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                  <label className="block rounded-xl px-3 py-2 transition-colors focus-within:bg-subtle hover:bg-subtle">
                    <span className="block text-[12px] font-semibold text-ink">What do you need?</span>
                    <select name="category" defaultValue="" className="mt-0.5 block w-full cursor-pointer bg-transparent text-[15px] text-ink-soft outline-none">
                      <option value="">Any service</option>
                      {SERVICES.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block rounded-xl px-3 py-2 transition-colors focus-within:bg-subtle hover:bg-subtle sm:border-l sm:border-line">
                    <span className="block text-[12px] font-semibold text-ink">Where?</span>
                    <select name="town" defaultValue="" className="mt-0.5 block w-full cursor-pointer bg-transparent text-[15px] text-ink-soft outline-none">
                      <option value="">Any town</option>
                      {TOWNS.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong sm:h-auto"
                  >
                    <svg aria-hidden viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="9" cy="9" r="5.5" />
                      <path d="m13.2 13.2 3.3 3.3" strokeLinecap="round" />
                    </svg>
                    Find pros
                  </button>
                </div>
              </form>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[13px] text-muted">Popular:</span>
                {popular.map((slug) => (
                  <Link
                    key={slug}
                    href={`/contractors?category=${slug}`}
                    className="rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-soft ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
                  >
                    {SERVICES.find((s) => s.slug === slug)!.name}
                  </Link>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
                <PrimaryLink href="/sign-up?as=customer">Post a project</PrimaryLink>
                <Link href="/sign-up?as=contractor" className="text-[15px] font-semibold text-ink underline decoration-line-strong underline-offset-[6px] hover:decoration-ink">
                  Join as a contractor
                </Link>
                <Link href="/sign-up?as=worker" className="text-[15px] font-semibold text-ink underline decoration-line-strong underline-offset-[6px] hover:decoration-ink">
                  Find shift work near you
                </Link>
              </div>
            </div>

            <div className="relative min-w-0">
              <Reveal>
                <ScreenFrame
                  {...shots.quotes}
                  alt="QuickPro for a property manager: three contractor quotes on a tenant fit-out, marked lowest price, earliest start and within budget"
                  priority
                  sizes="(min-width: 1024px) 600px, 100vw"
                  className="lg:mr-16"
                />
              </Reveal>
              <Reveal delay={150} className="absolute -right-1 -bottom-10 hidden w-[200px] sm:block lg:w-[210px]">
                <PhoneFrame src={shots.workerOffer.src} alt="QuickPro for a drywall taper: a shift offer with the pay and time, ready to accept" priority />
              </Reveal>
              <p className="mt-4 text-[12px] text-muted sm:mt-14 sm:pr-56">
                Screens from the QuickPro app with a labeled demo data set. The businesses and people shown are examples.
              </p>
            </div>
          </div>
          <div className="border-t border-line bg-surface">
            <ul className="mx-auto grid max-w-[1200px] grid-cols-1 gap-x-8 gap-y-3 px-5 py-5 text-[14px] text-ink-soft sm:grid-cols-3 sm:px-8">
              {[
                "Every business is reviewed by QuickPro staff before it can quote",
                "Contractors keep a current liability certificate on file",
                "Pay by card through Stripe, straight to the contractor",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <svg aria-hidden viewBox="0 0 16 16" className="mt-[3px] h-4 w-4 shrink-0 text-ok" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-16 bg-surface">
          <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeading eyebrow="Services" title="Find a pro for the job." body="Commercial construction, skilled trades and property services across Suffolk County." />
              <Link href="/contractors" className="shrink-0 text-[15px] font-semibold text-brand hover:text-brand-strong">
                Browse all contractors →
              </Link>
            </div>
            <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICES.map((s, i) => (
                <Reveal as="li" key={s.slug} delay={(i % 3) * 60}>
                  <Link
                    href={`/contractors?category=${s.slug}`}
                    className="group flex h-full items-start gap-4 rounded-xl bg-surface p-5 ring-1 ring-line transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(21,25,30,0.28)] hover:ring-line-strong"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <ServiceIcon slug={s.slug} className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[16px] font-semibold tracking-[-0.01em] text-ink">{s.name}</span>
                      <span className="mt-1 block text-[14px] leading-6 text-muted">{s.blurb}</span>
                    </span>
                    <span aria-hidden className="ml-auto self-center text-faint transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-brand">
                      →
                    </span>
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works, for each side */}
        <section id="how-it-works" className="scroll-mt-16 border-t border-line bg-canvas">
          <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
            <SectionHeading
              eyebrow="How it works"
              title="One marketplace, three ways in."
              body="Customers, contractors and crews each see their part of the same project, from the first request to the final payment."
            />
            <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {roles.map((r, i) => (
                <Reveal key={r.key} delay={i * 80} className="flex flex-col rounded-2xl bg-surface p-6 ring-1 ring-line sm:p-7">
                  <h3 className="text-[19px] font-bold tracking-[-0.02em] text-ink">{r.who}</h3>
                  <ol className="mt-5 flex-1 space-y-4">
                    {r.steps.map((step, n) => (
                      <li key={step} className="flex gap-3.5 text-[15px] leading-6 text-ink-soft">
                        <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
                          {n + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <Link
                    href={r.href}
                    className="group mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-[15px] font-semibold text-white transition-colors hover:bg-charcoal-strong"
                  >
                    {r.cta}
                    <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
                      →
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Customers */}
        <section id="customers" className="scroll-mt-16 border-t border-line bg-surface">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading
              eyebrow="For property owners and managers"
              title="Get the work quoted, built and billed without the phone tag."
              body="For property managers, building owners and facilities teams commissioning fit-outs, refreshes, repairs and recurring work."
            />
            <div className="mt-16 space-y-24 sm:mt-20 sm:space-y-28">
              <StoryRow
                title="Ask before you award"
                body="Every contractor who can see your request gets a private thread with you. Answer their questions about access and scope, ask about their price, and compare quotes with the lowest price, earliest start and your budget marked."
                points={["Each contractor sees only its own thread and quote", "Invite contractors who don't list your town", "Accept one quote; the others are told"]}
                image={{ ...shots.questions, alt: "Private question threads with two contractors on a tenant fit-out request" }}
              />
              <StoryRow
                flip
                title="Pay the invoice the way you choose"
                body="When the contractor reports the work complete, you confirm it or send it back with a note. The invoice comes to your invoices; pay by card through Stripe or by check, and both sides see when it's paid."
                points={["Invoices to pay on your overview", "Card payments go straight to the contractor", "Report a problem from the project if something's wrong"]}
                image={{ ...shots.invoice, alt: "A stairwell repaint invoice from a contractor with a pay by card button" }}
              />
            </div>
            <div className="mt-16 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink href="/sign-up?as=customer">Post a project</PrimaryLink>
              <SecondaryLink href="/contractors">Browse approved contractors</SecondaryLink>
            </div>
          </div>
        </section>

        {/* Contractors */}
        <section id="for-pros" className="scroll-mt-16 border-t border-line bg-canvas">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading
              eyebrow="For contractors and subcontractors"
              title="Win the work, staff it, and bill it from one place."
              body="For general contractors and trade businesses in carpentry, drywall and paint, flooring, masonry and concrete, general construction, and commercial services."
            />
            <div className="mt-14">
              <FeatureTabs features={contractorFeatures} />
            </div>
            <div className="mt-14">
              <PrimaryLink href="/sign-up?as=contractor">Join as a contractor</PrimaryLink>
            </div>
          </div>
        </section>

        {/* Workers */}
        <section id="workers" className="on-dark scroll-mt-16 bg-charcoal text-white">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading
              onDark
              eyebrow="For tradespeople and crew"
              title="Steady shifts close to home, with the pay up front."
              body="Carpenters, tapers, painters, laborers and crew leads build one profile. QuickPro staff review it, then you pick up shifts from local contractors in the towns you choose."
            />
            <div className="mt-16 grid gap-14 md:grid-cols-3 md:gap-8 lg:gap-12">
              {[
                {
                  n: "01",
                  title: "Find work that fits",
                  body: "Open shifts in your towns with the hourly rate, the estimate for the day, how your skills match, and whether it fits your availability.",
                  image: shots.workerFind,
                  alt: "Open shifts near a worker, with pay, skill match and availability",
                },
                {
                  n: "02",
                  title: "Accept the offer",
                  body: "Apply with a note. When a contractor offers you the shift, accept or decline from your phone. The address arrives when you accept.",
                  image: shots.workerOffer,
                  alt: "A shift offer waiting for the worker's answer",
                },
                {
                  n: "03",
                  title: "See your approved hours",
                  body: "Check in and out from your phone. See approved hours and estimated gross pay for each week, and question hours that look wrong.",
                  image: shots.workerHours,
                  alt: "A worker's approved hours and estimated gross pay for the week",
                },
              ].map((w, i) => (
                <Reveal key={w.n} delay={i * 100}>
                  <PhoneFrame src={w.image.src} alt={w.alt} className="mx-auto w-[min(16rem,78%)] ring-white/10" />
                  <p className="tabular mt-8 text-[13px] font-semibold text-[#f6884a]">{w.n}</p>
                  <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.01em]">{w.title}</h3>
                  <p className="mt-2 text-[15px] leading-7 text-white/70">{w.body}</p>
                </Reveal>
              ))}
            </div>
            <div className="mt-16 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink href="/sign-up?as=worker">Find shift work</PrimaryLink>
            </div>
            <p className="mt-6 max-w-[44rem] text-[13px] leading-6 text-white/55">
              Each shift says how the contractor engages you, for example as its employee, and the contractor pays you through its
              own payroll. QuickPro is not the employer and doesn&apos;t decide how anyone is classified.
            </p>
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="scroll-mt-16 border-t border-line bg-surface">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading
              eyebrow="Trust and safety"
              title="Reviewed by people. Enforced by the platform."
              body="What QuickPro does today, and what isn't built yet. A check appears here only once it is live."
            />
            <div className="mt-14 grid gap-12 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
              <div>
                <p className="text-[13px] font-semibold text-ink">In place today</p>
                <ul className="mt-4 border-t border-ink/10">
                  {today.map((t, i) => (
                    <Reveal as="li" key={t} delay={i * 40} className="flex gap-3.5 border-b border-ink/10 py-4 text-[15px] leading-7 text-ink-soft">
                      <svg aria-hidden viewBox="0 0 16 16" className="mt-1.5 h-4 w-4 shrink-0 text-ok" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {t}
                    </Reveal>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink">Not available yet</p>
                <ul className="mt-4 border-t border-ink/10">
                  {notYet.map((t) => (
                    <li key={t} className="flex gap-3.5 border-b border-ink/10 py-4 text-[15px] leading-7 text-muted">
                      <span aria-hidden className="mt-[13px] h-px w-3 shrink-0 bg-faint" />
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[13px] leading-6 text-muted">
                  A staff review means a person at QuickPro checked what was submitted. It isn&apos;t a guarantee of insurance
                  coverage, licensing or a worker&apos;s background.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="on-dark border-t border-white/10 bg-charcoal text-white">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-24">
            <Reveal className="max-w-[48rem]">
              <h2 className="font-display text-[38px] leading-[1.04] font-bold tracking-[-0.035em] text-balance sm:text-[58px]">
                Ready when the next job is.
              </h2>
            </Reveal>
            <div className="mt-12 grid border-y border-white/15 md:grid-cols-3">
              {[
                { who: "Property owners and managers", body: "Register your organization and post your first project once you're approved.", href: "/sign-up?as=customer", cta: "Post a project" },
                { who: "Contractors and subcontractors", body: "Register your business, list your trades and towns, and upload your insurance certificate.", href: "/sign-up?as=contractor", cta: "Join as a contractor" },
                { who: "Tradespeople and crew", body: "Create your profile, choose your towns and skills, and apply to local shifts.", href: "/sign-up?as=worker", cta: "Find shift work" },
              ].map((c, i) => (
                <div key={c.who} className={`py-9 ${i > 0 ? "border-t border-white/15 md:border-t-0 md:border-l md:pl-8" : ""} md:pr-8`}>
                  <p className="text-[13px] font-semibold text-[#f6884a]">{c.who}</p>
                  <p className="mt-3 text-[17px] leading-7 text-white/80">{c.body}</p>
                  <Link
                    href={c.href}
                    className="group mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-white underline decoration-white/30 underline-offset-[6px] hover:decoration-white"
                  >
                    {c.cta}
                    <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
                      →
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function StoryRow({
  title,
  body,
  points,
  image,
  flip = false,
}: {
  title: string;
  body: string;
  points: string[];
  image: { src: string; alt: string; width: number; height: number };
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
      <Reveal className={`lg:col-span-5 ${flip ? "lg:order-2" : ""}`}>
        <h3 className="text-[24px] leading-8 font-semibold tracking-[-0.02em] text-ink sm:text-[28px] sm:leading-9">{title}</h3>
        <p className="mt-4 text-[16px] leading-7 text-ink-soft">{body}</p>
        <ul className="mt-6 space-y-2.5 border-t border-ink/10 pt-5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[14px] leading-6 text-ink-soft">
              <span aria-hidden className="mt-[9px] h-[6px] w-[6px] shrink-0 rounded-full bg-signal" />
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={100} className={`lg:col-span-7 ${flip ? "lg:order-1" : ""}`}>
        <div className="rounded-2xl bg-subtle p-3 sm:p-6">
          <ScreenFrame {...image} sizes="(min-width: 1024px) 680px, 100vw" />
        </div>
      </Reveal>
    </div>
  );
}
