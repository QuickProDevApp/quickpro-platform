"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VIEWS = [
  { href: "/showcase/dashboard/contractor", label: "Contractor" },
  { href: "/showcase/dashboard/customer", label: "Customer" },
  { href: "/showcase/post-a-project", label: "Post a project" },
  { href: "/showcase/dashboard/worker", label: "Worker" },
];

/** Switches between the sample app screens of the presentation preview. */
export function ViewSwitcher() {
  const path = usePathname();
  return (
    <nav aria-label="Sample screens" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="inline-flex gap-1 rounded-xl bg-subtle p-1">
        {VIEWS.map((v) => {
          const active = path === v.href;
          return (
            <li key={v.href}>
              <Link
                href={v.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3.5 py-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                  active ? "bg-surface text-ink shadow-[0_1px_2px_rgba(21,25,30,0.12)]" : "text-muted hover:text-ink"
                }`}
              >
                {v.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
