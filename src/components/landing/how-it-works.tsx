"use client";

import { motion } from "motion/react";
import { EASE, InView } from "./motion";

const STEPS = [
  {
    title: "Find the right pro",
    body: "Search by trade and town, or post the job and let matched businesses come to you.",
    icon: (
      <>
        <circle cx="14" cy="14" r="7.5" />
        <path d="m19.5 19.5 6 6" />
        <path d="M11 14h6M14 11v6" />
      </>
    ),
  },
  {
    title: "Compare quotes and connect",
    body: "Ask questions privately, then weigh price, start date and reviews side by side.",
    icon: (
      <>
        <rect x="5" y="7" width="10" height="16" rx="2.5" />
        <rect x="17" y="4" width="10" height="16" rx="2.5" />
        <path d="M8.5 12h3M8.5 16h3M20.5 9h3M20.5 13h3" />
      </>
    ),
  },
  {
    title: "Get the job done",
    body: "Hire one business, follow the work, confirm it's finished and pay the invoice.",
    icon: (
      <>
        <path d="M6 17.5 12.5 24 26 9" />
        <path d="M6 9h8M6 5h12" opacity=".5" />
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-qp-mist">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28">
        <InView className="max-w-[44rem]">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-qp-blue uppercase">How it works</p>
          <h2 className="mt-3 text-[40px] leading-[1.02] font-bold tracking-[-0.04em] text-balance text-qp-navy sm:text-[56px]">
            From first search to final invoice.
          </h2>
        </InView>

        <ol className="relative mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          {/* The line that joins the steps draws itself in. */}
          <motion.span
            aria-hidden
            className="absolute top-8 right-[16%] left-[16%] hidden h-px origin-left bg-[linear-gradient(90deg,#2f6fe4,#6acefa)] md:block"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
            transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
          />
          {STEPS.map((s, i) => (
            <InView as="li" key={s.title} delay={150 + i * 160} className="relative md:text-center">
              <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-[20px] bg-white text-qp-blue shadow-[0_18px_36px_-20px_rgba(33,65,190,0.55)] ring-1 ring-qp-line">
                <svg aria-hidden viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {s.icon}
                </svg>
                <span className="tabular absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-qp-navy text-[12px] font-bold text-white">
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-6 text-[22px] font-bold tracking-[-0.025em] text-qp-navy">{s.title}</h3>
              <p className="mt-2 max-w-[22rem] text-[16px] leading-7 text-qp-navy-soft md:mx-auto md:max-w-[17rem]">{s.body}</p>
            </InView>
          ))}
        </ol>
      </div>
    </section>
  );
}
