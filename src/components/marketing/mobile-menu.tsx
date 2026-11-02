"use client";

import Link from "next/link";
import { useRef } from "react";

/** The phone and tablet menu: a disclosure that closes when a link is chosen. Works as a plain disclosure without JavaScript. */
export function MobileMenu({ items }: { items: { href: string; label: string }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");
  return (
    <details ref={ref} className="group relative lg:hidden">
      <summary aria-label="Menu" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-md text-ink hover:bg-ink/5">
        <svg viewBox="0 0 20 20" className="h-5 w-5 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
        </svg>
        <svg viewBox="0 0 20 20" className="hidden h-5 w-5 group-open:block" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="fixed inset-x-0 top-16 border-b border-line bg-paper px-5 pt-2 pb-6 shadow-[0_24px_40px_-24px_rgba(13,22,38,0.25)] sm:px-8">
        <nav aria-label="Main" className="flex flex-col">
          {items.map((n) => (
            <a key={n.href} href={n.href} onClick={close} className="border-b border-line py-3.5 text-[16px] text-ink">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link href="/sign-in" className="inline-flex h-11 items-center justify-center rounded-md text-[15px] font-medium text-ink ring-1 ring-inset ring-line-strong">
            Log in
          </Link>
          <Link href="/sign-up" className="inline-flex h-11 items-center justify-center rounded-md bg-ink text-[15px] font-medium text-white">
            Get started
          </Link>
        </div>
      </div>
    </details>
  );
}
