"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ServiceIcon } from "@/components/marketing/service-icon";
import { SERVICES, TOWNS, type ServiceSlug } from "@/lib/catalog";
import { HeroVideo } from "./hero-video";
import { EASE } from "./motion";

const POPULAR: { slug: ServiceSlug; label: string }[] = [
  { slug: "carpentry", label: "Carpentry" },
  { slug: "painting-drywall", label: "Painting" },
  { slug: "flooring", label: "Flooring" },
  { slug: "general-construction", label: "General construction" },
  { slug: "commercial-cleaning", label: "Cleaning" },
];

/** Fades its content up once on load; motion settings honour reduced motion. */
function Rise({ delay, className, children }: { delay: number; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Hero() {
  return (
    <section className="bg-white">
      {/* Phones: text and search, then the video, then the shortcuts. Desktop: video on the right. */}
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-x-14 px-5 pt-8 pb-16 sm:px-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:pt-16 lg:pb-24">
        <Rise delay={0} className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
          <p className="text-[14px] font-semibold text-qp-blue">Now onboarding in Suffolk County, NY</p>
          <h1 className="mt-4 text-balance text-[44px] leading-[1.02] font-bold tracking-[-0.04em] text-qp-navy sm:text-[60px] lg:text-[56px] xl:text-[66px]">
            Find the right crew. <span className="text-qp-blue">Get it done.</span>
          </h1>
          <p className="mt-5 max-w-[28rem] text-[18px] leading-[1.6] text-qp-navy-soft sm:text-[19px]">
            Discover contractors and skilled workers for projects big or small.
          </p>
          <SearchBar />
        </Rise>

        <Rise delay={0.2} className="mt-10 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-center">
          <HeroVideo />
        </Rise>

        <Rise delay={0.12} className="mt-8 min-w-0 lg:col-start-1 lg:row-start-2 lg:mt-5 lg:self-start">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13.5px] font-medium text-qp-slate">Popular</span>
            {POPULAR.map((p) => (
              <Link
                key={p.slug}
                href={`/contractors?category=${p.slug}`}
                className="group inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[13.5px] font-medium text-qp-navy-soft ring-1 ring-qp-line transition-[color,box-shadow] duration-200 hover:text-qp-blue hover:ring-qp-sky/60"
              >
                <ServiceIcon slug={p.slug} className="h-4 w-4 text-qp-slate transition-colors group-hover:text-qp-blue" />
                {p.label}
              </Link>
            ))}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3">
            <Link
              href="/sign-up?as=customer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-qp-navy px-6 text-[15.5px] font-semibold text-white transition-colors duration-200 hover:bg-[#13224a]"
            >
              Post a project
              <span aria-hidden>→</span>
            </Link>
            <Link href="/sign-up?as=contractor" className="text-center text-[15.5px] font-semibold text-qp-navy underline decoration-qp-line decoration-2 underline-offset-[7px] transition-colors hover:decoration-qp-blue sm:text-left">
              Join as a contractor
            </Link>
            <Link href="/sign-up?as=worker" className="text-center text-[15.5px] font-semibold text-qp-navy underline decoration-qp-line decoration-2 underline-offset-[7px] transition-colors hover:decoration-qp-blue sm:text-left">
              Find shift work near you
            </Link>
          </div>
        </Rise>
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
      className="mt-8 rounded-[20px] bg-white p-1.5 shadow-[0_2px_4px_rgba(11,22,51,0.04),0_12px_32px_-16px_rgba(11,22,51,0.22)] ring-1 ring-qp-line transition-shadow duration-200 focus-within:ring-2 focus-within:ring-qp-blue sm:rounded-full"
    >
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center">
        <Field label="What do you need?" icon="search">
          <select name="category" defaultValue="" className="block w-full cursor-pointer appearance-none bg-transparent pr-6 text-[16px] font-medium text-qp-navy outline-none">
            <option value="">Any service</option>
            {SERVICES.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Where?" icon="pin" divider>
          <select name="town" defaultValue="" className="block w-full cursor-pointer appearance-none bg-transparent pr-6 text-[16px] font-medium text-qp-navy outline-none">
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
          className="inline-flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-qp-blue px-7 text-[16px] font-semibold text-white transition-colors duration-200 hover:bg-qp-blue-strong sm:h-[56px] sm:rounded-full"
        >
          <svg aria-hidden viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.2 13.2 3.3 3.3" strokeLinecap="round" />
          </svg>
          Find pros
        </button>
      </div>
    </form>
  );
}

function Field({ label, icon, divider = false, children }: { label: string; icon: "search" | "pin"; divider?: boolean; children: React.ReactNode }) {
  return (
    <label
      className={`relative flex cursor-pointer items-center gap-3 rounded-[14px] px-4 py-2.5 transition-colors duration-200 hover:bg-qp-mist sm:rounded-full sm:px-5 ${
        divider ? "sm:before:absolute sm:before:top-3 sm:before:bottom-3 sm:before:left-0 sm:before:w-px sm:before:bg-qp-line" : ""
      }`}
    >
      <span aria-hidden className="shrink-0 text-qp-slate">
        {icon === "search" ? (
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.2 13.2 3.3 3.3" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 17.5s5.5-5 5.5-9.2a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9.2 5.5 9.2Z" strokeLinejoin="round" />
            <circle cx="10" cy="8.3" r="2" />
          </svg>
        )}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-qp-slate">{label}</span>
        {children}
        <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-0 bottom-1 h-4 w-4 text-qp-slate" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  );
}
