import type { Metadata } from "next";
import Link from "next/link";
import { FeatureTabs, type Feature } from "@/components/marketing/feature-tabs";
import { PhoneFrame, ScreenFrame } from "@/components/marketing/frames";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Reveal } from "@/components/marketing/reveal";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";

export const metadata: Metadata = {
  title: { absolute: "QuickPro · The right people. The right jobs. One platform." },
  description:
    "QuickPro brings businesses, contractors and workers together to find opportunities, coordinate teams and manage work from start to finish. Now onboarding in Suffolk County, NY.",
};

// Product screens are captured from the running app with example data (.review/marketing.mts).
const shots = {
  jobPeople: { src: "/marketing/job-people.webp", width: 2560, height: 1720 },
  jobsTable: { src: "/marketing/jobs-table.webp", width: 2560, height: 1280 },
  operations: { src: "/marketing/operations.webp", width: 2560, height: 1520 },
  quotes: { src: "/marketing/quotes.webp", width: 2560, height: 1720 },
  thread: { src: "/marketing/thread.webp", width: 1456, height: 1100 },
  notifications: { src: "/marketing/notifications.webp", width: 2560, height: 1240 },
  workerJobs: { src: "/marketing/worker-jobs.webp", width: 1170, height: 1992, phone: true },
  workerOffer: { src: "/marketing/worker-offer.webp", width: 1170, height: 1992, phone: true },
  workerSchedule: { src: "/marketing/worker-schedule.webp", width: 1170, height: 1992, phone: true },
};

const problems = [
  {
    problem: "A crew member calls out the night before a big job.",
    answer: "Post the shift in minutes. Reviewed workers in that town see the pay and hours and apply from their phone.",
  },
  {
    problem: "Finding someone reliable means calling around.",
    answer: "Every worker profile is reviewed by QuickPro staff before they can apply, and applicants show their skills and home town.",
  },
  {
    problem: "Schedules live in texts, spreadsheets and memory.",
    answer: "Each job shows who is booked, who has an offer waiting and who applied. Workers see every upcoming shift in one list.",
  },
  {
    problem: "Details get lost between the office, the crew and the site.",
    answer: "Each job has one message thread for the business, booked workers and QuickPro staff, with notifications when something changes.",
  },
];

const features: Feature[] = [
  {
    key: "discovery",
    label: "Worker discovery",
    title: "Reviewed workers who live nearby",
    body: "Applicants come with their skills, home town and note. See at a glance how each one matches the job before you offer it.",
    points: ["Profiles reviewed by QuickPro staff", "Skill match against what the job asks for", "Towns each worker covers", "Staff can match workers to urgent jobs by hand"],
    image: { ...shots.jobPeople, alt: "A job's people panel with two booked workers and applicants, beside the job details" },
  },
  {
    key: "posting",
    label: "Job posting",
    title: "Post a shift in a couple of minutes",
    body: "Date, hours, headcount, hourly pay and how you engage the worker. QuickPro checks pay against the market minimum before it goes live.",
    points: ["Pay shown to workers before they apply", "Address shared only once someone is booked", "Edit until workers are booked", "Your insurance must be reviewed and current to post"],
    image: { ...shots.jobsTable, alt: "A contractor's upcoming jobs with pay, bookings, applicants and status" },
  },
  {
    key: "applications",
    label: "Applications",
    title: "Applications you can act on",
    body: "Offer the job, decline with a note, or leave it open. Workers hear back in the app as soon as you decide.",
    points: ["One tap to offer, with the worker's confirmation", "Decline with a reason they can read", "Applicants who were not offered stay out of the thread", "Every change recorded in an audit log"],
    image: { ...shots.jobPeople, alt: "Applicants and booked workers on a job" },
  },
  {
    key: "messaging",
    label: "Messaging",
    title: "One thread per job",
    body: "Parking, gear, timing: the business, its booked workers and QuickPro staff talk in one place, and nobody else can read it.",
    points: ["Booked and offered workers only", "In-app notifications for new messages", "Staff can hide a message without deleting the record", "Email and text alerts are planned, not live yet"],
    image: { ...shots.thread, alt: "A job's message thread between the business and two booked workers" },
  },
  {
    key: "scheduling",
    label: "Scheduling",
    title: "Every upcoming shift in one list",
    body: "Workers keep their availability on their profile and see their accepted jobs, with time, place and pay, in My jobs.",
    points: ["Weekly availability on each worker profile", "Accepted, offered and past jobs in one view", "Times always in Eastern time", "Calendar sync is planned, not live yet"],
    image: { ...shots.workerSchedule, alt: "A worker's My jobs list on a phone" },
  },
  {
    key: "staffing",
    label: "Staffing management",
    title: "Know what needs attention today",
    body: "The overview lists unfilled jobs starting within 48 hours, new applicants and offers waiting for an answer, above the week's schedule.",
    points: ["Owners, admins, dispatchers and members", "Invite your team by link", "Customer requests that match your services", "Insurance status and expiry in view"],
    image: { ...shots.operations, alt: "A contractor's operations overview listing jobs that need attention" },
  },
  {
    key: "tracking",
    label: "Job tracking",
    title: "From posted to complete",
    body: "Each job moves from open to filled to in progress to complete. Mark it done and every booked assignment is closed out with it.",
    points: ["Status everyone can see", "Cancel with a reason workers are told", "Unanswered offers lapse when the job starts", "Notifications at each step"],
    image: { ...shots.notifications, alt: "A list of in-app notifications about applications, offers and messages" },
  },
];

const steps = [
  {
    title: "Post the work",
    body: "A business posts a shift, or a property manager posts a service request.",
    detail: "Pay, hours, town and skills for a shift. Scope, dates and budget for a request. Site addresses stay private.",
    image: { ...shots.jobsTable, alt: "Upcoming jobs posted by a contractor" },
  },
  {
    title: "Connect with the right people",
    body: "Reviewed workers apply to shifts; approved contractors quote on requests.",
    detail: "Compare applicants by skills and town, or compare quotes side by side. Offer the job or accept a quote when you're ready.",
    image: { ...shots.quotes, alt: "A customer comparing three quotes for nightly office cleaning" },
  },
  {
    title: "Manage it to done",
    body: "Message the crew, track bookings and close the job out.",
    detail: "The job thread, booking status and notifications keep everyone current until the work is marked complete.",
    image: { ...shots.operations, alt: "The operations overview for a contractor" },
  },
];

const today = [
  "QuickPro staff review every business registration before it can post work or quote.",
  "Contractors must have a general liability certificate reviewed by staff, with a current expiry date, to post jobs or quote.",
  "Every worker profile is reviewed by staff before the worker can apply.",
  "Pay is shown before anyone applies and can't be set below the market's minimum hourly rate.",
  "Street addresses and site contacts are shared only with booked workers or the awarded contractor.",
  "Changes to jobs, bookings, quotes and staff review decisions are recorded in an audit log; staff can moderate messages.",
];

const planned = [
  "Ratings and reviews after completed work",
  "Identity verification and background checks, with consent, through a specialist provider",
  "Invoicing and payments through Stripe",
  "Email and text message alerts",
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[13px] font-medium tracking-[0.01em] text-signal-ink">
      <span aria-hidden className="h-[7px] w-[7px] rounded-[2px] bg-signal" />
      {children}
    </p>
  );
}

function SectionHeading({ eyebrow, title, body, className = "" }: { eyebrow: string; title: string; body?: string; className?: string }) {
  return (
    <Reveal className={`max-w-[42rem] ${className}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-[32px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-ink sm:text-[44px]">{title}</h2>
      {body ? <p className="mt-5 text-[17px] leading-7 text-pretty text-ink-soft">{body}</p> : null}
    </Reveal>
  );
}

function PrimaryLink({ href, children, inverted = false }: { href: string; children: React.ReactNode; inverted?: boolean }) {
  return (
    <Link
      href={href}
      className={`group inline-flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-medium transition-colors ${
        inverted ? "bg-white text-ink hover:bg-white/90" : "bg-ink text-white hover:bg-navy"
      }`}
    >
      {children}
      <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

function SecondaryLink({ href, children, inverted = false }: { href: string; children: React.ReactNode; inverted?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-12 items-center justify-center rounded-md px-5 text-[15px] font-medium ring-1 transition-colors ring-inset ${
        inverted ? "text-white ring-white/25 hover:bg-white/10" : "bg-surface text-ink ring-ink/15 hover:bg-ink/[0.03] hover:ring-ink/25"
      }`}
    >
      {children}
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-[1200px] px-5 pt-16 sm:px-8 sm:pt-24 lg:pt-28">
            <Eyebrow>Now onboarding in Suffolk County, New York</Eyebrow>
            <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
              <h1 className="text-[44px] leading-[1.02] font-semibold tracking-[-0.045em] text-balance text-ink sm:text-[68px] lg:col-span-7 lg:text-[80px]">
                The right people. The right jobs. One platform.
              </h1>
              <div className="lg:col-span-5 lg:pb-2">
                <p className="max-w-[34rem] text-[18px] leading-8 text-pretty text-ink-soft sm:text-[19px]">
                  QuickPro brings businesses, contractors, and workers together to find opportunities, coordinate teams,
                  and manage work from start to finish.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <PrimaryLink href="/sign-up?as=contractor">Find Workers</PrimaryLink>
                  <SecondaryLink href="/sign-up?as=worker">Find Work</SecondaryLink>
                </div>
                <p className="mt-5 text-[14px] text-muted">
                  Need a service done?{" "}
                  <Link href="/sign-up?as=customer" className="font-medium text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-ink">
                    Request quotes from approved contractors
                  </Link>
                </p>
              </div>
            </div>

            <div className="relative mt-16 sm:mt-20">
              <Reveal>
                <ScreenFrame
                  {...shots.jobPeople}
                  alt="QuickPro for a contractor: a floor scrub job with two booked workers, applicants and job details"
                  priority
                  sizes="(min-width: 1200px) 1100px, 100vw"
                  className="lg:mr-28"
                />
              </Reveal>
              <Reveal delay={150} className="absolute -right-2 -bottom-10 hidden w-[230px] md:block lg:right-0 lg:w-[260px]">
                <PhoneFrame src={shots.workerOffer.src} alt="QuickPro for a worker: a job offer with pay and time, ready to accept" priority />
              </Reveal>
            </div>
            <p className="mt-5 pb-14 text-[12px] text-muted sm:pb-20 md:mt-20">
              Screens from the QuickPro app, shown with example data.
            </p>
          </div>
        </section>

        {/* Problem and solution */}
        <section className="border-t border-ink/[0.07] bg-surface">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading
              eyebrow="Why QuickPro"
              title="Commercial service work runs on people. Finding and coordinating them shouldn't run on phone calls."
            />
            <div className="mt-14 border-t border-ink/10">
              <div className="hidden grid-cols-2 gap-12 py-3 text-[13px] font-medium text-muted md:grid">
                <span>Where work gets stuck</span>
                <span>How QuickPro handles it</span>
              </div>
              <ol>
                {problems.map((p, i) => (
                  <Reveal as="li" key={p.problem} delay={i * 60} className="grid gap-3 border-t border-ink/10 py-7 md:grid-cols-2 md:gap-12">
                    <p className="flex gap-4 text-[19px] leading-7 font-medium tracking-[-0.01em] text-ink">
                      <span className="tabular w-6 shrink-0 text-[14px] leading-7 font-medium text-faint">0{i + 1}</span>
                      {p.problem}
                    </p>
                    <p className="pl-10 text-[16px] leading-7 text-ink-soft md:pl-0">{p.answer}</p>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 border-t border-ink/[0.07]">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading
              eyebrow="Features"
              title="Everything between “we need people” and “job complete.”"
              body="Built around how service businesses actually staff work: reviewed people, clear pay, private sites and one record of what happened."
            />
            <div className="mt-14">
              <FeatureTabs features={features} />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16 border-t border-ink/[0.07] bg-surface">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading eyebrow="How it works" title="Three steps, from posting to done." />
            <div className="mt-14">
              <HowItWorks steps={steps} />
            </div>
          </div>
        </section>

        {/* Businesses */}
        <section id="businesses" className="scroll-mt-16 border-t border-ink/[0.07]">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading
              eyebrow="For businesses and contractors"
              title="Say yes to the bigger job."
              body="For cleaning, pressure washing, landscaping and facility service companies, and for the property managers who hire them."
            />
            <div className="mt-16 space-y-24 sm:mt-20 sm:space-y-32">
              <BusinessRow
                title="Add hands when your crew is stretched"
                body="A warehouse wants a floor scrub Tuesday at 7 AM and you're two people short. Post the shift at $26 an hour; reviewed floor care techs in Islip see it and apply. Offer it to the two with the right skills, and they accept from their phones."
                points={["Your crew and QuickPro workers on one job", "Phone numbers shared once a worker accepts", "You engage the worker; the job says how"]}
                image={{ ...shots.jobPeople, alt: "A job with booked workers and applicants" }}
              />
              <BusinessRow
                flip
                title="Win customer work with clear quotes"
                body="A property manager in Central Islip posts nightly cleaning for a three-floor office. Approved contractors who serve Islip see the scope and budget and send a price. The manager compares quotes side by side and awards one; only the winner gets the address."
                points={["Each contractor sees only its own quote", "Revise or withdraw until the customer decides", "Requests that match your services, in your overview"]}
                image={{ ...shots.quotes, alt: "A property manager comparing three quotes" }}
              />
              <BusinessRow
                title="Run the week from one screen"
                body="Unfilled jobs starting soon, new applicants and offers waiting for an answer sit at the top of your overview, above the week's schedule. Dispatchers on your team can act on them without the owner on the phone."
                points={["Roles for owners, admins, dispatchers and members", "Insurance status and expiry always visible", "Every change in the audit log"]}
                image={{ ...shots.operations, alt: "A contractor's operations overview" }}
              />
            </div>
          </div>
        </section>

        {/* Workers */}
        <section id="workers" className="scroll-mt-16 bg-ink text-white">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <Reveal className="max-w-[42rem]">
              <p className="flex items-center gap-2 text-[13px] font-medium text-[#f59a72]">
                <span aria-hidden className="h-[7px] w-[7px] rounded-[2px] bg-signal" />
                For workers
              </p>
              <h2 className="mt-4 text-[32px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[44px]">
                Good shifts close to home, with the pay up front.
              </h2>
              <p className="mt-5 text-[17px] leading-7 text-white/70">
                Build your profile once. QuickPro staff review it, then you can apply to jobs in the towns you choose.
              </p>
            </Reveal>
            <div className="mt-16 grid gap-14 md:grid-cols-3 md:gap-8 lg:gap-12">
              {[
                {
                  n: "01",
                  title: "Find nearby work",
                  body: "Open jobs in your towns, with the hourly rate, the estimate for the shift and how your skills match.",
                  image: shots.workerJobs,
                  alt: "Open jobs near a worker, with pay",
                },
                {
                  n: "02",
                  title: "Apply and accept",
                  body: "Apply with a note. When a business offers you the job, accept or decline; the address arrives when you accept.",
                  image: shots.workerOffer,
                  alt: "A job offer waiting for the worker's answer",
                },
                {
                  n: "03",
                  title: "Keep your schedule",
                  body: "Every accepted job in My jobs, a message thread with the crew, and notifications when anything changes.",
                  image: shots.workerSchedule,
                  alt: "A worker's accepted jobs",
                },
              ].map((w, i) => (
                <Reveal key={w.n} delay={i * 100}>
                  <PhoneFrame src={w.image.src} alt={w.alt} className="mx-auto w-[min(16rem,78%)] ring-white/10" />
                  <p className="tabular mt-8 text-[13px] text-white/45">{w.n}</p>
                  <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.01em]">{w.title}</h3>
                  <p className="mt-2 text-[15px] leading-7 text-white/70">{w.body}</p>
                </Reveal>
              ))}
            </div>
            <div className="mt-16 flex flex-col gap-3 sm:flex-row">
              <PrimaryLink href="/sign-up?as=worker" inverted>
                Find Work
              </PrimaryLink>
            </div>
            <p className="mt-6 max-w-[42rem] text-[13px] leading-6 text-white/50">
              Businesses on QuickPro engage workers directly and say how on every job, for example as their employee.
              QuickPro is not the employer.
            </p>
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="scroll-mt-16 bg-surface">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading
              eyebrow="Trust and reliability"
              title="Reviewed by people, enforced by the platform."
              body="What QuickPro does today, and what is still on the way. We only list a check here once it is live."
            />
            <div className="mt-14 grid gap-12 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
              <div>
                <p className="text-[13px] font-medium text-ink">In place today</p>
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
                <p className="text-[13px] font-medium text-ink">Planned, not available yet</p>
                <ul className="mt-4 border-t border-ink/10">
                  {planned.map((t) => (
                    <li key={t} className="flex gap-3.5 border-b border-ink/10 py-4 text-[15px] leading-7 text-muted">
                      <span aria-hidden className="mt-[11px] h-px w-3 shrink-0 bg-faint" />
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[13px] leading-6 text-muted">
                  A staff review means a person at QuickPro checked what was submitted. It isn&apos;t a guarantee of
                  insurance coverage or of a worker&apos;s background.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="border-t border-ink/[0.07]">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
            <Reveal className="max-w-[48rem]">
              <h2 className="text-[36px] leading-[1.04] font-semibold tracking-[-0.035em] text-balance text-ink sm:text-[56px]">
                Ready when the next job is.
              </h2>
            </Reveal>
            <div className="mt-12 grid border-y border-ink/10 md:grid-cols-2">
              <div className="py-10 md:border-r md:border-ink/10 md:pr-12">
                <p className="text-[13px] font-medium text-muted">Businesses and contractors</p>
                <p className="mt-3 text-[22px] leading-8 font-semibold tracking-[-0.015em] text-ink">
                  Register your business, list your services and towns, and post your first job once you&apos;re approved.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <PrimaryLink href="/sign-up?as=contractor">Find Workers</PrimaryLink>
                  <SecondaryLink href="/sign-up?as=customer">Request service</SecondaryLink>
                </div>
              </div>
              <div className="border-t border-ink/10 py-10 md:border-t-0 md:pl-12">
                <p className="text-[13px] font-medium text-muted">Workers</p>
                <p className="mt-3 text-[22px] leading-8 font-semibold tracking-[-0.015em] text-ink">
                  Create your profile, choose your towns, and apply to local jobs with the pay shown up front.
                </p>
                <div className="mt-7">
                  <PrimaryLink href="/sign-up?as=worker">Find Work</PrimaryLink>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function BusinessRow({
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
              <span aria-hidden className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-signal" />
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={100} className={`lg:col-span-7 ${flip ? "lg:order-1" : ""}`}>
        <div className="rounded-[14px] bg-[#eef0f3] p-3 sm:p-6">
          <ScreenFrame {...image} sizes="(min-width: 1024px) 680px, 100vw" />
        </div>
      </Reveal>
    </div>
  );
}
