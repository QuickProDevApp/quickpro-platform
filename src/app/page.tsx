import type { Metadata } from "next";
import Link from "next/link";
import { FeatureTabs, type Feature } from "@/components/marketing/feature-tabs";
import { PhoneFrame, ScreenFrame } from "@/components/marketing/frames";
import { Reveal } from "@/components/marketing/reveal";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { display } from "@/fonts/display";

export const metadata: Metadata = {
  title: { absolute: "QuickPro · From the first bid to the final invoice" },
  description:
    "The marketplace for commercial construction and skilled trades on Long Island. Property owners get quotes from approved contractors, contractors staff the work with subcontractors and local tradespeople, and everyone works from one record of the project. Now onboarding in Suffolk County, NY.",
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

type Side = "Customer" | "Contractor" | "Crew";

const journey: { title: string; body: string; who: Side[] }[] = [
  { title: "Post the project", body: "Scope, town, dates and budget. The site address stays private.", who: ["Customer"] },
  { title: "Questions and quotes", body: "Contractors who serve the town ask privately, then quote. Compare side by side.", who: ["Customer", "Contractor"] },
  { title: "Award", body: "Accept one quote. The winner gets the site details; the others are told.", who: ["Customer"] },
  { title: "Staff the work", body: "Schedule shifts, book local tradespeople, bring in subcontractors.", who: ["Contractor", "Crew"] },
  { title: "Track the work", body: "Crew check in and out, tick off the checklist and share photos; the contractor approves hours.", who: ["Contractor", "Crew"] },
  { title: "Confirm and bill", body: "The customer confirms completion, then pays the invoice by card or check.", who: ["Customer", "Contractor"] },
];

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
    <p className={`flex items-center gap-2 text-[12.5px] font-semibold tracking-[0.08em] uppercase ${onDark ? "text-[#e8955a]" : "text-signal-ink"}`}>
      <span aria-hidden className="h-[7px] w-[7px] bg-signal" />
      {children}
    </p>
  );
}

function SectionHeading({ eyebrow, title, body, onDark = false }: { eyebrow: string; title: string; body?: string; onDark?: boolean }) {
  return (
    <Reveal className="max-w-[44rem]">
      <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow>
      <h2
        className={`mt-5 font-display text-[34px] leading-[1.08] font-medium tracking-[-0.02em] text-balance sm:text-[46px] ${onDark ? "text-white" : "text-ink"}`}
      >
        {title}
      </h2>
      {body ? <p className={`mt-5 text-[17px] leading-7 text-pretty ${onDark ? "text-white/70" : "text-ink-soft"}`}>{body}</p> : null}
    </Reveal>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex h-12 items-center justify-center gap-2 rounded-[4px] bg-signal px-5 text-[15px] font-semibold text-charcoal transition-colors hover:bg-[#e48745]"
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
      className={`inline-flex h-12 items-center justify-center rounded-[4px] px-5 text-[15px] font-medium ring-1 transition-colors ring-inset ${
        onDark ? "text-white ring-white/30 hover:bg-white/[0.08]" : "bg-surface text-ink ring-ink/20 hover:bg-ink/[0.03] hover:ring-ink/35"
      }`}
    >
      {children}
    </Link>
  );
}

function SideTag({ side }: { side: Side }) {
  const tone = side === "Customer" ? "bg-[#e9eef2] text-[#2f4d63]" : side === "Contractor" ? "bg-signal-soft text-signal-ink" : "bg-[#ecebe6] text-ink-soft";
  return <span className={`inline-flex h-5 items-center rounded-[3px] px-1.5 text-[11.5px] font-semibold ${tone}`}>{side}</span>;
}

export default function HomePage() {
  return (
    <div className={`${display.variable} flex min-h-full flex-col bg-paper text-ink`}>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-[1200px] px-5 pt-14 sm:px-8 sm:pt-20 lg:pt-24">
            <Eyebrow>Commercial construction and trades · Suffolk County, NY</Eyebrow>
            <div className="mt-7 grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
              <h1 className="font-display text-[46px] leading-[1.0] font-medium tracking-[-0.03em] text-balance text-ink sm:text-[68px] lg:col-span-7 lg:text-[84px]">
                From the first bid to the final invoice.
              </h1>
              <div className="lg:col-span-5 lg:pb-3">
                <p className="max-w-[34rem] text-[18px] leading-8 text-pretty text-ink-soft">
                  QuickPro is the marketplace for commercial construction and skilled trades on Long Island. Property owners get
                  quotes from approved contractors. Contractors staff the work with subcontractors and local tradespeople. Everyone
                  works from one record of the project, the hours and the bill.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <PrimaryLink href="/sign-up?as=customer">Post a project</PrimaryLink>
                  <SecondaryLink href="/sign-up?as=contractor">Join as a contractor</SecondaryLink>
                </div>
                <p className="mt-5 text-[14px] text-muted">
                  Skilled trade or crew member?{" "}
                  <Link href="/sign-up?as=worker" className="font-medium text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                    Find shift work near you
                  </Link>
                </p>
              </div>
            </div>

            <div className="relative mt-14 sm:mt-20">
              <Reveal>
                <ScreenFrame
                  {...shots.quotes}
                  alt="QuickPro for a property manager: three contractor quotes on a tenant fit-out, marked lowest price, earliest start and within budget"
                  priority
                  sizes="(min-width: 1200px) 1100px, 100vw"
                  className="lg:mr-28"
                />
              </Reveal>
              <Reveal delay={150} className="absolute -right-2 -bottom-10 hidden w-[230px] md:block lg:right-0 lg:w-[262px]">
                <PhoneFrame src={shots.workerOffer.src} alt="QuickPro for a drywall taper: a shift offer with the pay and time, ready to accept" priority />
              </Reveal>
            </div>
            <p className="mt-5 pb-14 text-[12px] text-muted sm:pb-20 md:mt-20">
              Screens from the QuickPro app, shown with a labeled demo data set. The businesses and people in them are examples.
            </p>
          </div>
        </section>

        {/* The journey */}
        <section id="how-it-works" className="scroll-mt-16 border-t border-ink/[0.08] bg-surface">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading
              eyebrow="How it works"
              title="One job, three sides, one record."
              body="The customer, the contractor and the crew each see their part of the same project, from the request to the payment. Each step is a real status change, recorded as it happens."
            />
            <ol className="mt-14 grid gap-px overflow-hidden rounded-[6px] border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
              {journey.map((step, i) => (
                <Reveal as="li" key={step.title} delay={i * 60} className="relative bg-surface px-6 pt-8 pb-7">
                  <span aria-hidden className="absolute top-0 left-6 h-[3px] w-10 bg-signal" />
                  <p className="tabular text-[13px] font-semibold text-muted">0{i + 1}</p>
                  <h3 className="mt-2 text-[18px] leading-6 font-semibold tracking-[-0.01em] text-ink">{step.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-6 text-ink-soft">{step.body}</p>
                  <p className="mt-5 flex flex-wrap gap-1.5">
                    {step.who.map((w) => (
                      <SideTag key={w} side={w} />
                    ))}
                  </p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Customers */}
        <section id="customers" className="scroll-mt-16 border-t border-ink/[0.08]">
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
        <section id="contractors" className="scroll-mt-16 border-t border-ink/[0.08] bg-surface">
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
                  <p className="tabular mt-8 text-[13px] font-semibold text-[#e8955a]">{w.n}</p>
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
        <section id="trust" className="scroll-mt-16 bg-surface">
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
              <h2 className="font-display text-[38px] leading-[1.04] font-medium tracking-[-0.025em] text-balance sm:text-[58px]">
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
                  <p className="text-[13px] font-semibold text-[#e8955a]">{c.who}</p>
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
              <span aria-hidden className="mt-[9px] h-[5px] w-[5px] shrink-0 bg-signal" />
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={100} className={`lg:col-span-7 ${flip ? "lg:order-1" : ""}`}>
        <div className="rounded-[6px] bg-[#ebe8e1] p-3 sm:p-6">
          <ScreenFrame {...image} sizes="(min-width: 1024px) 680px, 100vw" />
        </div>
      </Reveal>
    </div>
  );
}
