"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { EASE, InView } from "./motion";

type Role = {
  key: string;
  tab: string;
  headline: string;
  points: string[];
  cta: { href: string; label: string };
  moment: React.ReactNode;
};

const ROLES: Role[] = [
  {
    key: "customers",
    tab: "Customers",
    headline: "Customers find professionals.",
    points: ["Post the job once", "Get quotes from approved local businesses", "Hire, follow the work, and pay in one place"],
    cta: { href: "/sign-up?as=customer", label: "Post a project" },
    moment: <QuotesMoment />,
  },
  {
    key: "contractors",
    tab: "Contractors",
    headline: "Contractors win projects and staff them.",
    points: ["Requests for your trades and towns", "Book reviewed tradespeople by the shift", "Approve hours, invoice and get paid"],
    cta: { href: "/sign-up?as=contractor", label: "Join as a contractor" },
    moment: <CrewMoment />,
  },
  {
    key: "subcontractors",
    tab: "Subcontractors",
    headline: "Subcontractors pick up the work they do best.",
    points: ["Scoped offers from general contractors", "Agreed price on record", "Staff your part with your own crew"],
    cta: { href: "/sign-up?as=contractor", label: "Join as a subcontractor" },
    moment: <SubcontractMoment />,
  },
  {
    key: "workers",
    tab: "Skilled workers",
    headline: "Skilled workers find shifts close to home.",
    points: ["Jobs that match your skills and towns", "Pay shown before you apply", "Accept offers from your phone"],
    cta: { href: "/sign-up?as=worker", label: "Find shift work" },
    moment: <ShiftMoment />,
  },
];

export function Ecosystem() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const role = ROLES[active];

  const onKey = (e: KeyboardEvent) => {
    const last = ROLES.length - 1;
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? (active === last ? 0 : active + 1) : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (active === 0 ? last : active - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section id="for-pros" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28">
        <InView className="max-w-[46rem]">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-qp-blue uppercase">One marketplace</p>
          <h2 className="mt-3 text-[40px] leading-[1.02] font-bold tracking-[-0.04em] text-balance text-qp-navy sm:text-[56px]">
            Everyone on the job, on the same page.
          </h2>
        </InView>

        <InView delay={100} className="mt-12">
          <div role="tablist" aria-label="QuickPro marketplace" onKeyDown={onKey} className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:inline-flex sm:rounded-full sm:bg-qp-mist sm:p-1.5 sm:px-1.5">
            {ROLES.map((r, i) => {
              const selected = i === active;
              return (
                <button
                  key={r.key}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  role="tab"
                  id={`${id}-tab-${r.key}`}
                  aria-selected={selected}
                  aria-controls={`${id}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(i)}
                  className={`relative shrink-0 rounded-full px-5 py-2.5 text-[15px] font-semibold whitespace-nowrap transition-colors duration-200 ${selected ? "text-white" : "bg-qp-mist text-qp-navy-soft hover:text-qp-navy sm:bg-transparent"}`}
                >
                  {selected ? (
                    <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-full bg-qp-navy" transition={{ type: "spring", stiffness: 420, damping: 36 }} />
                  ) : null}
                  <span className="relative">{r.tab}</span>
                </button>
              );
            })}
          </div>
        </InView>

        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${role.key}`}
          className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={role.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: EASE }}>
              <h3 className="text-[32px] leading-[1.1] font-bold tracking-[-0.035em] text-qp-navy sm:text-[40px]">{role.headline}</h3>
              <ul className="mt-7 space-y-3.5">
                {role.points.map((p, i) => (
                  <motion.li
                    key={p}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, ease: EASE, delay: 0.08 + i * 0.06 }}
                    className="flex items-center gap-3 text-[17px] text-qp-navy-soft"
                  >
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-qp-ice text-qp-blue">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {p}
                  </motion.li>
                ))}
              </ul>
              <Link
                href={role.cta.href}
                className="group mt-9 inline-flex h-[52px] items-center gap-2 rounded-full bg-qp-blue px-7 text-[15.5px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(47,111,228,0.7)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-qp-blue-strong active:translate-y-0"
              >
                {role.cta.label}
                <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              </Link>
            </motion.div>
          </AnimatePresence>

          <div className="relative">
            <div aria-hidden className="absolute inset-4 -z-0 rounded-[36px] bg-[linear-gradient(145deg,#2141be,#2f6fe4_55%,#6acefa)] opacity-[0.12] blur-2xl" />
            <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(160deg,#f5f8fd,#eaf2fe)] p-6 ring-1 ring-qp-line sm:p-10">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={role.key}
                  initial={{ opacity: 0, y: 20, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.4, ease: EASE }}
                >
                  {role.moment}
                </motion.div>
              </AnimatePresence>
              <p className="relative mt-5 text-[12px] text-qp-slate">Illustration with sample businesses and people.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Small product moments, drawn for this page. They are pictures, not controls. */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-[0_18px_40px_-24px_rgba(11,22,51,0.45)] ring-1 ring-qp-line sm:p-5 ${className}`}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px] font-semibold tracking-[0.06em] text-qp-slate uppercase">{children}</p>;
}

function QuotesMoment() {
  const rows = [
    { name: "Bayview Build Co.", price: "$18,400", note: "Starts Mon", tag: "Earliest start" },
    { name: "North Shore Interiors", price: "$17,250", note: "Starts Thu", tag: "Lowest price" },
    { name: "Coastline Contracting", price: "$19,900", note: "Starts Wed", tag: null },
  ];
  return (
    <div aria-hidden className="space-y-3">
      <Card>
        <Label>Lobby refresh · Islip</Label>
        <p className="mt-1 text-[17px] font-semibold text-qp-navy">3 quotes to compare</p>
      </Card>
      {rows.map((r, i) => (
        <Card key={r.name} className={i === 1 ? "ring-2 ring-qp-sky" : ""}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-qp-ice text-[13px] font-bold text-qp-royal">{r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-qp-navy">{r.name}</p>
              <p className="text-[13px] text-qp-slate">{r.note}</p>
            </div>
            <div className="text-right">
              <p className="tabular text-[16px] font-bold text-qp-navy">{r.price}</p>
              {r.tag ? <p className="text-[12px] font-semibold text-qp-blue">{r.tag}</p> : null}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function CrewMoment() {
  return (
    <div aria-hidden className="space-y-3">
      <Card>
        <Label>Shift · Tue 7:00 AM – 3:30 PM · Islip</Label>
        <p className="mt-1 text-[17px] font-semibold text-qp-navy">Trim and door hardware install</p>
        <div className="mt-4 flex items-center justify-between text-[13px] text-qp-slate">
          <span>2 of 3 booked</span>
          <span className="tabular font-semibold text-qp-navy">$38.00/hr</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-qp-ice">
          <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,#2f6fe4,#6acefa)]" initial={{ width: "0%" }} animate={{ width: "66%" }} transition={{ duration: 0.9, ease: EASE, delay: 0.2 }} />
        </div>
      </Card>
      {[
        { n: "Ana M.", s: "Finish carpentry · Islip", st: "Booked" },
        { n: "Devon P.", s: "General labor · Babylon", st: "Booked" },
        { n: "Sam O.", s: "Crew lead · Brookhaven", st: "Applied" },
      ].map((w) => (
        <Card key={w.n}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-qp-navy text-[12px] font-bold text-white">{w.n.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-qp-navy">{w.n}</p>
              <p className="text-[13px] text-qp-slate">{w.s}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${w.st === "Booked" ? "bg-qp-ice text-qp-royal" : "bg-qp-mist text-qp-slate ring-1 ring-qp-line"}`}>{w.st}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SubcontractMoment() {
  return (
    <div aria-hidden className="space-y-3">
      <Card>
        <Label>Subcontract offer from Bayview Build Co.</Label>
        <p className="mt-1 text-[19px] font-bold tracking-[-0.015em] text-qp-navy">Drywall, Suite 210 fit-out</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-qp-mist p-3">
            <p className="text-[12px] text-qp-slate">Agreed price</p>
            <p className="tabular text-[18px] font-bold text-qp-navy">$18,500</p>
          </div>
          <div className="rounded-xl bg-qp-mist p-3">
            <p className="text-[12px] text-qp-slate">Window</p>
            <p className="text-[18px] font-bold text-qp-navy">Nov 12–20</p>
          </div>
        </div>
        <p className="mt-4 text-[14px] leading-6 text-qp-navy-soft">Hang, tape and finish 4,200 sq ft. Level 4 finish in the reception area.</p>
        <div className="mt-5 flex gap-2">
          <span className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-qp-blue text-[14px] font-semibold text-white">Accept</span>
          <span className="inline-flex h-10 flex-1 items-center justify-center rounded-full text-[14px] font-semibold text-qp-navy ring-1 ring-qp-line">Ask a question</span>
        </div>
      </Card>
    </div>
  );
}

function ShiftMoment() {
  return (
    <div aria-hidden className="mx-auto max-w-[21rem]">
      <div className="rounded-[34px] bg-qp-navy p-2.5 shadow-[0_30px_60px_-30px_rgba(11,22,51,0.7)]">
        <div className="rounded-[26px] bg-white p-5">
          <div className="mx-auto h-1.5 w-16 rounded-full bg-qp-line" />
          <Label>
            <span className="mt-5 block">New offer</span>
          </Label>
          <p className="mt-1 text-[19px] font-bold tracking-[-0.015em] text-qp-navy">Finish carpentry</p>
          <p className="text-[14px] text-qp-slate">North Shore Interiors · Huntington</p>
          <div className="mt-5 rounded-2xl bg-[linear-gradient(140deg,#2141be,#2f6fe4_60%,#4fb4f5)] p-4 text-white">
            <p className="text-[12px] text-white/75">Pay</p>
            <p className="tabular text-[30px] leading-9 font-bold">$40.00/hr</p>
            <p className="text-[13px] text-white/80">Thu 8:00 AM – 4:00 PM · about $320</p>
          </div>
          <div className="mt-4 flex gap-2">
            <span className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-qp-navy text-[14px] font-semibold text-white">Accept</span>
            <span className="inline-flex h-11 flex-1 items-center justify-center rounded-full text-[14px] font-semibold text-qp-navy ring-1 ring-qp-line">Decline</span>
          </div>
        </div>
      </div>
    </div>
  );
}
