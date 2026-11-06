"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ServiceIcon } from "@/components/marketing/service-icon";
import type { ServiceSlug } from "@/lib/catalog";
import { EASE, InView } from "./motion";

/** Short names and art direction for each service the marketplace offers. */
export const CATEGORIES: { slug: ServiceSlug; name: string; line: string; art: string }[] = [
  { slug: "general-construction", name: "General construction", line: "Site labor, selective demolition and cleanup", art: "from-[#1b33a3] via-[#2141be] to-[#3f86ef]" },
  { slug: "carpentry", name: "Carpentry", line: "Framing, trim, doors and millwork", art: "from-[#2141be] via-[#2f6fe4] to-[#5fb9f6]" },
  { slug: "painting-drywall", name: "Painting & drywall", line: "Hang, tape, finish and paint", art: "from-[#2556d0] via-[#3d8bf2] to-[#6acefa]" },
  { slug: "flooring", name: "Flooring", line: "Prep, tile, LVT and carpet tile", art: "from-[#13256f] via-[#2141be] to-[#2f6fe4]" },
  { slug: "masonry-concrete", name: "Masonry & concrete", line: "Flatwork, curbs and block repair", art: "from-[#1d2f86] via-[#2b5fd8] to-[#4593f6]" },
  { slug: "commercial-cleaning", name: "Cleaning", line: "Janitorial and post-construction", art: "from-[#2f6fe4] via-[#4fa6f6] to-[#8fdcfb]" },
  { slug: "pressure-washing", name: "Pressure washing", line: "Exteriors, garages and sidewalks", art: "from-[#1f4fc4] via-[#3a8af0] to-[#6acefa]" },
  { slug: "landscaping", name: "Landscaping", line: "Grounds, cleanups and snow removal", art: "from-[#173a9e] via-[#2a6bdc] to-[#57b6f4]" },
  { slug: "facility-services", name: "Facility services", line: "Maintenance, porters and set-up", art: "from-[#0f2160] via-[#2141be] to-[#3f86ef]" },
];

/** Art for a category: a blueprint field in the brand blues with the trade's mark drawn large. */
export function CategoryArt({ slug, art, className = "" }: { slug: ServiceSlug; art: string; className?: string }) {
  return (
    <div aria-hidden className={`relative overflow-hidden bg-gradient-to-br ${art} ${className}`}>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="absolute -right-10 -bottom-12 h-56 w-56 rounded-full border-[28px] border-white/[0.08]" />
      <ServiceIcon slug={slug} className="absolute top-1/2 left-1/2 h-[46%] w-[46%] -translate-x-1/2 -translate-y-1/2 text-white/90 drop-shadow-[0_12px_24px_rgba(11,22,51,0.35)] [&_*]:[stroke-width:1.1]" />
    </div>
  );
}

export function Services() {
  const [active, setActive] = useState(1);
  const a = CATEGORIES[active];
  return (
    <section id="services" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <InView className="max-w-[40rem]">
            <p className="text-[13px] font-semibold tracking-[0.08em] text-qp-blue uppercase">Services</p>
            <h2 className="mt-3 text-[40px] leading-[1.02] font-bold tracking-[-0.04em] text-balance text-qp-navy sm:text-[56px]">
              Every trade the job needs.
            </h2>
          </InView>
          <InView delay={100}>
            <Link href="/contractors" className="group inline-flex items-center gap-2 text-[15.5px] font-semibold text-qp-blue">
              Browse all contractors
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
          </InView>
        </div>

        {/* Large screens: pick a trade on the left, see it on the right. */}
        <div className="mt-14 hidden gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ul className="border-t border-qp-line">
            {CATEGORIES.map((c, i) => (
              <li key={c.slug} className="border-b border-qp-line">
                <Link
                  href={`/contractors?category=${c.slug}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  className="group flex items-center gap-4 py-4"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ${
                      i === active ? "bg-qp-blue text-white" : "bg-qp-mist text-qp-slate group-hover:text-qp-blue"
                    }`}
                  >
                    <ServiceIcon slug={c.slug} className="h-5 w-5" />
                  </span>
                  <span
                    className={`flex-1 text-[24px] font-semibold tracking-[-0.025em] transition-[color,transform] duration-300 ${
                      i === active ? "translate-x-1 text-qp-navy" : "text-qp-navy/45 group-hover:text-qp-navy/80"
                    }`}
                  >
                    {c.name}
                  </span>
                  <span aria-hidden className={`text-[18px] text-qp-blue transition-[opacity,transform] duration-300 ${i === active ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"}`}>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="relative">
            <div className="sticky top-28 overflow-hidden rounded-[28px] shadow-[0_40px_80px_-48px_rgba(33,65,190,0.7)]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={a.slug}
                  initial={{ opacity: 0, scale: 1.06 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <CategoryArt slug={a.slug} art={a.art} className="aspect-[5/4]" />
                </motion.div>
              </AnimatePresence>
              <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgba(11,22,51,0.7))] p-8 pt-24 text-white">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={a.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}>
                    <p className="text-[30px] font-bold tracking-[-0.03em]">{a.name}</p>
                    <p className="mt-1 text-[16px] text-white/80">{a.line}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Phones and tablets: a swipeable rail. */}
        <ul className="-mx-5 mt-10 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-4 sm:scroll-px-8 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:hidden">
          {CATEGORIES.map((c) => (
            <li key={c.slug} className="w-[72%] shrink-0 snap-start sm:w-[42%]">
              <Link href={`/contractors?category=${c.slug}`} className="group block overflow-hidden rounded-3xl bg-white ring-1 ring-qp-line">
                <div className="overflow-hidden">
                  <CategoryArt slug={c.slug} art={c.art} className="aspect-[4/3] transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="p-4">
                  <p className="text-[17px] font-semibold tracking-[-0.015em] text-qp-navy">{c.name}</p>
                  <p className="mt-0.5 text-[13.5px] leading-5 text-qp-slate">{c.line}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
