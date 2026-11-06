"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useState } from "react";
import { LandingLogo } from "./brand";
import { EASE } from "./motion";

export const NAV = [
  { href: "/contractors", label: "Find a pro" },
  { href: "/#services", label: "Services" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#for-pros", label: "For contractors" },
  { href: "/#workers", label: "Find work" },
];

/** The landing page's sticky header: clear over the hero, frosted once you scroll. */
export function LandingHeader() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
        scrolled || open
          ? "bg-white/85 shadow-[0_1px_0_rgba(11,22,51,0.06),0_8px_24px_-18px_rgba(11,22,51,0.25)] backdrop-blur-xl"
          : "bg-white/0"
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-6 px-5 sm:px-8">
        <LandingLogo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="relative rounded-full px-3.5 py-2 text-[14.5px] font-medium text-qp-navy-soft transition-colors hover:bg-qp-ice hover:text-qp-navy"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/sign-in" className="rounded-full px-4 py-2 text-[14.5px] font-semibold text-qp-navy transition-colors hover:bg-qp-ice">
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-10 items-center rounded-full bg-qp-blue px-5 text-[14.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(47,111,228,0.6)] transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-qp-blue-strong active:translate-y-0"
          >
            Get started
          </Link>
        </div>
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="landing-menu"
          onClick={() => setOpen((o) => !o)}
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-qp-navy transition-colors hover:bg-qp-ice lg:hidden"
        >
          <span aria-hidden className="relative block h-3.5 w-5">
            <span className={`absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
            <span className={`absolute top-1.5 left-0 h-0.5 w-5 rounded-full bg-current transition-opacity duration-200 ${open ? "opacity-0" : ""}`} />
            <span className={`absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
          </span>
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="landing-menu"
            key="menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="absolute inset-x-0 top-full border-t border-qp-line bg-white px-5 pt-2 pb-6 shadow-[0_24px_40px_-24px_rgba(11,22,51,0.35)] sm:px-8 lg:hidden"
          >
            <nav aria-label="Main" className="flex flex-col">
              {NAV.map((n, i) => (
                <motion.a
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i, duration: 0.25, ease: EASE }}
                  className="flex items-center justify-between border-b border-qp-line py-4 text-[17px] font-medium text-qp-navy"
                >
                  {n.label}
                  <span aria-hidden className="text-qp-blue">→</span>
                </motion.a>
              ))}
            </nav>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link href="/sign-in" className="inline-flex h-12 items-center justify-center rounded-full text-[15px] font-semibold text-qp-navy ring-1 ring-qp-line ring-inset">
                Log in
              </Link>
              <Link href="/sign-up" className="inline-flex h-12 items-center justify-center rounded-full bg-qp-blue text-[15px] font-semibold text-white">
                Get started
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
