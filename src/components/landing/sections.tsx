import Link from "next/link";
import { InView, Stagger, StaggerItem } from "./motion";

/** Skilled workers: the band the "Find work" link lands on. */
export function WorkersBand() {
  return (
    <section id="workers" className="on-blue relative isolate scroll-mt-20 overflow-hidden bg-[linear-gradient(140deg,#13256f_0%,#2141be_40%,#2f6fe4_80%,#4593f6_100%)] text-white">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(90deg,transparent,black_40%,black)]" />
      <svg aria-hidden viewBox="0 0 400 400" className="absolute -right-40 -bottom-48 -z-10 h-[640px] w-[640px] text-white/[0.07]">
        <circle cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="56" />
      </svg>
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end">
        <InView>
          <p className="text-[13px] font-semibold tracking-[0.08em] text-qp-cyan uppercase">For skilled workers</p>
          <h2 className="mt-3 text-[40px] leading-[1.02] font-bold tracking-[-0.04em] text-balance sm:text-[60px]">
            Steady shifts close to home, with the pay up front.
          </h2>
          <Link
            href="/sign-up?as=worker"
            className="group mt-10 inline-flex h-[52px] items-center gap-2 rounded-full bg-white px-7 text-[15.5px] font-semibold text-qp-navy shadow-[0_12px_28px_-14px_rgba(11,22,51,0.6)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            Find shift work
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </InView>
        <div>
          <Stagger className="divide-y divide-white/15 border-y border-white/15">
            {[
              ["Build one profile", "Your skills, towns and the days you can work."],
              ["Apply with the pay shown", "Every shift lists the hourly rate before you apply."],
              ["Accept, check in, get paid", "Offers come to your phone; approved hours are on record."],
            ].map(([t, b]) => (
              <StaggerItem key={t} className="py-5">
                <p className="text-[19px] font-semibold tracking-[-0.015em]">{t}</p>
                <p className="mt-1 text-[15.5px] text-white/75">{b}</p>
              </StaggerItem>
            ))}
          </Stagger>
          <p className="mt-6 text-[13px] leading-6 text-white/65">
            Each shift says how the business engages you, for example as its employee, and the business pays you through its own
            payroll. QuickPro is not the employer and doesn&apos;t decide how anyone is classified.
          </p>
        </div>
      </div>
    </section>
  );
}

const IN_PLACE = [
  { t: "People review every business", b: "Staff approve each business, and contractors keep a reviewed liability certificate on file." },
  { t: "People review every worker", b: "Worker profiles are checked by staff before anyone can apply." },
  { t: "Private until you hire", b: "Site addresses go only to the hired contractor and the booked crew." },
  { t: "Payments through Stripe", b: "Card payments go straight to the contractor. QuickPro never holds the money." },
];

/** What QuickPro does today, and what isn't built yet. */
export function Trust() {
  return (
    <section id="trust" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28">
        <InView className="max-w-[44rem]">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-qp-blue uppercase">Trust and safety</p>
          <h2 className="mt-3 text-[40px] leading-[1.02] font-bold tracking-[-0.04em] text-balance text-qp-navy sm:text-[56px]">
            Reviewed by people. Enforced by the platform.
          </h2>
        </InView>
        <Stagger className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {IN_PLACE.map((x, i) => (
            <StaggerItem key={x.t}>
              <span aria-hidden className="tabular text-[14px] font-bold text-qp-blue">0{i + 1}</span>
              <span aria-hidden className="mt-3 block h-px w-full bg-[linear-gradient(90deg,#2f6fe4,transparent)]" />
              <p className="mt-5 text-[19px] font-semibold tracking-[-0.02em] text-qp-navy">{x.t}</p>
              <p className="mt-2 text-[15px] leading-6 text-qp-navy-soft">{x.b}</p>
            </StaggerItem>
          ))}
        </Stagger>
        <InView delay={150}>
          <p className="mt-14 max-w-[52rem] rounded-2xl bg-qp-mist px-5 py-4 text-[14px] leading-6 text-qp-navy-soft">
            <span className="font-semibold text-qp-navy">Not built yet:</span> trade license checks (electrical, plumbing and HVAC aren&apos;t
            offered until they exist), identity and background checks, text alerts, and live card payments. A staff review means a
            person checked what was submitted; it isn&apos;t a guarantee.
          </p>
        </InView>
      </div>
    </section>
  );
}

/** The closing call to action, one door for each kind of user. */
export function FinalCta() {
  const doors = [
    { who: "Customers", line: "Post a project and compare quotes.", href: "/sign-up?as=customer", cta: "Post a project" },
    { who: "Contractors", line: "List your trades and towns.", href: "/sign-up?as=contractor", cta: "Join as a contractor" },
    { who: "Skilled workers", line: "Pick up shifts near you.", href: "/sign-up?as=worker", cta: "Find shift work" },
  ];
  return (
    <section className="bg-qp-mist">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28">
        <InView>
          <h2 className="max-w-[14ch] text-[48px] leading-[0.98] font-bold tracking-[-0.045em] text-balance text-qp-navy sm:text-[80px]">
            Ready when the next job is.
          </h2>
        </InView>
        <Stagger className="mt-14 grid gap-4 md:grid-cols-3">
          {doors.map((d) => (
            <StaggerItem key={d.who}>
              <Link
                href={d.href}
                className="group flex h-full flex-col rounded-[28px] bg-white p-7 ring-1 ring-qp-line transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-36px_rgba(33,65,190,0.55)]"
              >
                <span className="text-[13px] font-semibold tracking-[0.06em] text-qp-blue uppercase">{d.who}</span>
                <span className="mt-3 flex-1 text-[22px] leading-8 font-semibold tracking-[-0.02em] text-qp-navy">{d.line}</span>
                <span className="mt-8 inline-flex items-center justify-between rounded-full bg-qp-mist px-5 py-3 text-[15px] font-semibold text-qp-navy transition-colors duration-300 group-hover:bg-qp-blue group-hover:text-white">
                  {d.cta}
                  <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                </span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
