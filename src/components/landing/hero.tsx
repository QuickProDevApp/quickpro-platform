"use client";

import Link from "next/link";
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ServiceIcon } from "@/components/marketing/service-icon";
import { SERVICES, TOWNS, type ServiceSlug } from "@/lib/catalog";
import { EASE } from "./motion";

const POPULAR: { slug: ServiceSlug; label: string }[] = [
  { slug: "carpentry", label: "Carpentry" },
  { slug: "painting-drywall", label: "Painting" },
  { slug: "flooring", label: "Flooring" },
  { slug: "general-construction", label: "General construction" },
  { slug: "commercial-cleaning", label: "Cleaning" },
];

const HEADLINE = [
  { text: "Find the", accent: false },
  { text: "right crew.", accent: false },
  { text: "Get it done.", accent: true },
];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const stageY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const glowY = useTransform(scrollYProgress, [0, 1], [0, 120]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden">
      {/* Soft blue light behind the hero. */}
      <motion.div
        aria-hidden
        style={{ y: glowY }}
        className="pointer-events-none absolute -top-40 right-[-20%] -z-10 h-[720px] w-[900px] rounded-full bg-[radial-gradient(closest-side,rgba(106,206,250,0.28),rgba(69,147,246,0.12)_55%,transparent)] blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[linear-gradient(180deg,#f5f8fd_0%,#ffffff_100%)]"
      />

      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-12 px-5 pt-8 pb-16 sm:px-8 sm:pt-14 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:pt-16 lg:pb-24">
        <div className="min-w-0">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full bg-qp-ice px-3.5 py-1.5 text-[13px] font-semibold text-qp-royal"
          >
            <span aria-hidden className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-qp-sky opacity-60 [animation-duration:2.4s]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-qp-blue" />
            </span>
            Now onboarding in Suffolk County, NY
          </motion.p>

          <h1 className="mt-6 text-[54px] leading-[0.98] font-bold tracking-[-0.045em] text-qp-navy sm:text-[80px] lg:text-[84px] xl:text-[96px]">
            {HEADLINE.map((w, i) => (
              <span key={i} className="block overflow-hidden pb-[0.06em]">
                <motion.span
                  className={`inline-block ${w.accent ? "bg-[linear-gradient(100deg,#2141be_0%,#2f6fe4_45%,#4fb4f5_100%)] bg-clip-text pr-[0.04em] text-transparent" : ""}`}
                  initial={{ y: "105%" }}
                  animate={{ y: "0%" }}
                  transition={{ duration: 0.75, ease: EASE, delay: 0.1 + i * 0.1 }}
                >
                  {w.text}
                </motion.span>
                {i < HEADLINE.length - 1 ? " " : ""}
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.5 }}
            className="mt-6 max-w-[30rem] text-[19px] leading-8 text-qp-navy-soft sm:text-[20px]"
          >
            Discover contractors and skilled workers for projects big or small.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.62 }}
          >
            <SearchBar />
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[13.5px] font-medium text-qp-slate">Popular</span>
              {POPULAR.map((p) => (
                <Link
                  key={p.slug}
                  href={`/contractors?category=${p.slug}`}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[13.5px] font-medium text-qp-navy-soft ring-1 ring-qp-line transition-[color,box-shadow,transform] duration-200 hover:-translate-y-px hover:text-qp-blue hover:ring-qp-sky/60"
                >
                  <ServiceIcon slug={p.slug} className="h-4 w-4 text-qp-sky transition-colors group-hover:text-qp-blue" />
                  {p.label}
                </Link>
              ))}
            </div>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
              <Link
                href="/sign-up?as=customer"
                className="group inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-qp-navy px-7 text-[15.5px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(11,22,51,0.6)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[#13224a] active:translate-y-0"
              >
                Post a project
                <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">
                  →
                </span>
              </Link>
              <Link href="/sign-up?as=contractor" className="text-[15.5px] font-semibold text-qp-navy underline decoration-qp-line decoration-2 underline-offset-[7px] transition-colors hover:decoration-qp-blue">
                Join as a contractor
              </Link>
              <Link href="/sign-up?as=worker" className="text-[15.5px] font-semibold text-qp-navy underline decoration-qp-line decoration-2 underline-offset-[7px] transition-colors hover:decoration-qp-blue">
                Find shift work near you
              </Link>
            </div>
          </motion.div>
        </div>

        <motion.div style={{ y: stageY }} className="relative min-w-0">
          <HeroStage />
        </motion.div>
      </div>
    </section>
  );
}

/** The search: the same form and fields as before, sent to the contractor directory. */
function SearchBar() {
  return (
    <form
      action="/contractors"
      method="get"
      role="search"
      aria-label="Find a pro"
      className="group/search mt-9 rounded-[22px] bg-white p-2 shadow-[0_1px_2px_rgba(11,22,51,0.06),0_24px_48px_-24px_rgba(33,65,190,0.35)] ring-1 ring-qp-line transition-shadow duration-300 focus-within:shadow-[0_1px_2px_rgba(11,22,51,0.06),0_28px_56px_-22px_rgba(33,65,190,0.5)] focus-within:ring-qp-sky/70"
    >
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto]">
        <Field label="What do you need?" icon="search">
          <select name="category" defaultValue="" className="peer block w-full cursor-pointer appearance-none bg-transparent pr-6 text-[16px] font-medium text-qp-navy outline-none">
            <option value="">Any service</option>
            {SERVICES.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Where?" icon="pin" divider>
          <select name="town" defaultValue="" className="peer block w-full cursor-pointer appearance-none bg-transparent pr-6 text-[16px] font-medium text-qp-navy outline-none">
            <option value="">Any town</option>
            {TOWNS.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          className="group/btn relative inline-flex h-14 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-qp-blue px-7 text-[16px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-qp-blue-strong active:scale-[0.98] sm:h-auto"
        >
          <span aria-hidden className="absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.28),transparent)] transition-transform duration-700 group-hover/btn:translate-x-full" />
          <svg aria-hidden viewBox="0 0 20 20" className="relative h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.2 13.2 3.3 3.3" strokeLinecap="round" />
          </svg>
          <span className="relative">Find pros</span>
        </button>
      </div>
    </form>
  );
}

function Field({ label, icon, divider = false, children }: { label: string; icon: "search" | "pin"; divider?: boolean; children: React.ReactNode }) {
  return (
    <label
      className={`relative flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 transition-colors duration-200 focus-within:bg-qp-mist hover:bg-qp-mist ${
        divider ? "sm:before:absolute sm:before:top-3 sm:before:bottom-3 sm:before:left-0 sm:before:w-px sm:before:bg-qp-line" : ""
      }`}
    >
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-qp-ice text-qp-blue">
        {icon === "search" ? (
          <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
            <rect x="3" y="4" width="14" height="12" rx="2.5" />
            <path d="M7 4V2.8M13 4V2.8M3 8.5h14" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M10 17.5s5.5-5 5.5-9.2a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9.2 5.5 9.2Z" strokeLinejoin="round" />
            <circle cx="10" cy="8.3" r="2" />
          </svg>
        )}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold tracking-[0.01em] text-qp-slate">{label}</span>
        {children}
        <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-0 bottom-1 h-4 w-4 text-qp-slate" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* The hero stage: an animated illustration of a request finding its crew,
   with sample businesses. It cycles slowly while on screen, stops when it
   isn't, and holds still for people who prefer reduced motion. */

type Scene = {
  service: ServiceSlug;
  query: string;
  town: string;
  pros: { name: string; initials: string; tone: string; quote: string; start: string }[];
  crew: string;
};

const SCENES: Scene[] = [
  {
    service: "carpentry",
    query: "Carpentry",
    town: "Islip",
    pros: [
      { name: "Bayview Build Co.", initials: "BB", tone: "bg-qp-ice text-qp-royal", quote: "$12,400", start: "Starts Tue" },
      { name: "North Shore Interiors", initials: "NS", tone: "bg-[#e6f6fd] text-[#11648c]", quote: "$13,150", start: "Starts Mon" },
      { name: "Coastline Contracting", initials: "CC", tone: "bg-[#eef0fb] text-[#3a3f9e]", quote: "$11,900", start: "Starts Thu" },
    ],
    crew: "2 finish carpenters booked · Tue 7:00 AM",
  },
  {
    service: "painting-drywall",
    query: "Painting",
    town: "Babylon",
    pros: [
      { name: "Ridgeline Drywall & Paint", initials: "RD", tone: "bg-qp-ice text-qp-royal", quote: "$7,800", start: "Starts Sat" },
      { name: "Bayview Build Co.", initials: "BB", tone: "bg-[#e6f6fd] text-[#11648c]", quote: "$8,250", start: "Starts Fri" },
      { name: "Harbor Coatings", initials: "HC", tone: "bg-[#eef0fb] text-[#3a3f9e]", quote: "$7,450", start: "Starts Mon" },
    ],
    crew: "Painter and taper booked · Sat 8:00 AM",
  },
  {
    service: "flooring",
    query: "Flooring",
    town: "Brookhaven",
    pros: [
      { name: "Great South Bay Floors", initials: "GS", tone: "bg-qp-ice text-qp-royal", quote: "$9,600", start: "Starts Wed" },
      { name: "Coastline Contracting", initials: "CC", tone: "bg-[#e6f6fd] text-[#11648c]", quote: "$10,200", start: "Starts Tue" },
      { name: "Sound Avenue Flooring", initials: "SA", tone: "bg-[#eef0fb] text-[#3a3f9e]", quote: "$9,350", start: "Starts Fri" },
    ],
    crew: "3 installers booked · Wed 6:00 PM",
  },
];

function HeroStage() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [scene, setScene] = useState(0);
  const [tick, setStep] = useState(0);
  const step = reduce ? 4 : tick;

  // 0 search · 1-3 quotes arrive · 4 accepted + crew booked. Then the next scene.
  useEffect(() => {
    if (reduce || !visible) return;
    const delays = [700, 450, 450, 900, 3600];
    const t = setTimeout(() => {
      if (step < 4) setStep(step + 1);
      else {
        setScene((s) => (s + 1) % SCENES.length);
        setStep(0);
      }
    }, delays[step]);
    return () => clearTimeout(t);
  }, [step, visible, reduce]);

  const s = SCENES[scene];
  const chosen = 0;

  return (
    <div ref={ref} className="relative">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
        className="relative flex min-h-[470px] flex-col overflow-hidden rounded-[32px] bg-[linear-gradient(145deg,#1b33a3_0%,#2141be_28%,#2f6fe4_62%,#4fb4f5_100%)] p-5 shadow-[0_40px_80px_-40px_rgba(33,65,190,0.65)] sm:min-h-[560px] sm:p-8"
        aria-label="Illustration: a request gets quotes from local contractors, one is accepted and a crew is booked. Sample businesses."
        role="img"
      >
        {/* Blueprint grid and the sweep of the Q. */}
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_at_70%_30%,black,transparent_75%)]" />
        <svg aria-hidden viewBox="0 0 400 400" className="absolute -top-24 -right-24 h-[420px] w-[420px] text-white/[0.09]">
          <circle cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="56" />
        </svg>

        <MapLayer step={step} scene={scene} />

        <div className="relative flex flex-1 flex-col gap-3" aria-hidden>
          {/* The request */}
          <div className="flex items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-[0_12px_30px_-16px_rgba(11,22,51,0.6)] backdrop-blur">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-qp-blue text-white">
              <ServiceIcon slug={s.service} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold tracking-wide text-qp-slate uppercase">New request</p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={s.query}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="truncate text-[15px] font-semibold text-qp-navy"
                >
                  {s.query} in {s.town}
                </motion.p>
              </AnimatePresence>
            </div>
            <span className="rounded-full bg-qp-ice px-2.5 py-1 text-[12px] font-semibold text-qp-royal">
              {step === 0 ? "Matching…" : `${Math.min(step, 3)} quote${Math.min(step, 3) === 1 ? "" : "s"}`}
            </span>
          </div>

          {/* Quotes arrive */}
          <div className="space-y-2.5 pl-0 sm:pl-6">
            {s.pros.map((p, i) => {
              const shown = step > i;
              const accepted = step >= 4 && i === chosen;
              const faded = step >= 4 && i !== chosen;
              return (
                <motion.div
                  key={`${scene}-${p.name}`}
                  initial={false}
                  animate={{
                    opacity: shown ? (faded ? 0.55 : 1) : 0,
                    x: shown ? 0 : 28,
                    scale: accepted ? 1.02 : 1,
                  }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_14px_32px_-18px_rgba(11,22,51,0.55)] ring-2 transition-[box-shadow] ${
                    accepted ? "ring-qp-cyan" : "ring-transparent"
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-bold ${p.tone}`}>{p.initials}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-qp-navy">{p.name}</p>
                    <p className="text-[12.5px] text-qp-slate">{p.start}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-[15px] font-bold text-qp-navy">{p.quote}</p>
                    <AnimatePresence>
                      {accepted ? (
                        <motion.p
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-qp-blue"
                        >
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Accepted
                        </motion.p>
                      ) : (
                        <p className="text-[12px] text-qp-slate">Quote</p>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="flex-1" />
          {/* Crew booked */}
          <motion.div
            initial={false}
            animate={{ opacity: step >= 4 ? 1 : 0, y: step >= 4 ? 0 : 12 }}
            transition={{ duration: 0.45, ease: EASE, delay: step >= 4 ? 0.25 : 0 }}
            className="flex items-center gap-3 rounded-2xl bg-qp-navy/80 p-3 text-white ring-1 ring-white/15 backdrop-blur"
          >
            <span className="flex -space-x-2">
              {["AM", "DP", "KG"].map((n, i) => (
                <span key={n} className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-qp-navy ${["bg-qp-cyan text-qp-navy", "bg-white text-qp-royal", "bg-qp-sky text-white"][i]}`}>
                  {n}
                </span>
              ))}
            </span>
            <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{s.crew}</p>
            <span className="h-2 w-2 rounded-full bg-qp-cyan" />
          </motion.div>
        </div>

        {/* Scene dots */}
        <div aria-hidden className="relative mt-6 flex items-center gap-1.5">
          {SCENES.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === scene ? "w-6 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      </motion.div>
      <p className="mt-3 text-[12.5px] text-qp-slate">Illustration with sample businesses.</p>
    </div>
  );
}

/** A quiet street map behind the cards; a pin drops for each quote. */
const PINS = [
  [
    { x: 22, y: 70 },
    { x: 58, y: 80 },
    { x: 80, y: 64 },
  ],
  [
    { x: 30, y: 82 },
    { x: 66, y: 70 },
    { x: 46, y: 62 },
  ],
  [
    { x: 74, y: 82 },
    { x: 20, y: 64 },
    { x: 52, y: 74 },
  ],
];

function MapLayer({ step, scene }: { step: number; scene: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <g fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="0.35" vectorEffect="non-scaling-stroke">
          <path d="M-5 72 C 20 66, 35 78, 55 70 S 90 58, 105 66" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
          <path d="M-5 86 C 25 82, 50 92, 105 84" />
          <path d="M12 55 L 18 105" />
          <path d="M40 50 C 42 70, 38 85, 44 105" />
          <path d="M70 52 L 64 105" />
          <path d="M88 55 C 84 75, 90 90, 86 105" />
          <path d="M-5 60 L 105 56" />
        </g>
        <path d="M-5 95 C 30 90, 60 99, 105 93 L 105 105 L -5 105 Z" fill="rgba(106,206,250,0.18)" />
      </svg>
      {PINS[scene].map((p, i) => (
        <motion.span
          key={`${scene}-${i}`}
          className="absolute -translate-x-1/2 -translate-y-full"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          initial={false}
          animate={{ opacity: step > i ? 1 : 0, y: step > i ? 0 : -10, scale: step >= 4 && i !== 0 ? 0.8 : 1 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-[0_6px_14px_rgba(11,22,51,0.35)]">
            <span className={`h-2.5 w-2.5 rounded-full ${step >= 4 && i === 0 ? "bg-qp-cyan" : "bg-qp-blue"}`} />
            {step >= 4 && i === 0 ? <span className="absolute inset-0 animate-ping rounded-full bg-white/60 [animation-iteration-count:2]" /> : null}
          </span>
        </motion.span>
      ))}
    </div>
  );
}
