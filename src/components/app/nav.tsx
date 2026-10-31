"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";

export type NavItem = { href: string; label: string; exact?: boolean };

function isActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

/**
 * The app's top bar: workspaces inline on desktop, a menu sheet on phones.
 * The bell and the account menu are always in reach.
 */
export function AppHeader({
  items,
  unread,
  name,
  email,
}: {
  items: NavItem[];
  unread: number;
  name: string;
  email: string;
}) {
  const pathname = usePathname();
  // The menu closes on navigation: it is open only for the path it was opened on.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo href="/app" />
        <span aria-hidden className="hidden h-5 w-px bg-line md:block" />
        <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex">
          {items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`max-w-56 truncate rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-subtle text-ink" : "text-muted hover:bg-subtle hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <NotificationsBell unread={unread} active={pathname.startsWith("/app/notifications")} />
          <details className="group relative hidden md:block">
            <summary
              className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md pr-2 pl-1 text-sm text-ink-soft transition-colors hover:bg-subtle"
              aria-label="Account menu"
            >
              <Initials name={name || email} />
              <span className="max-w-40 truncate">{name || email}</span>
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 text-faint transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="absolute right-0 mt-1.5 w-64 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_24px_-6px_rgba(13,22,38,0.16)]">
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-medium text-ink">{name}</p>
                <p className="truncate text-xs text-muted">{email}</p>
              </div>
              <div className="my-1 h-px bg-line" />
              <Link href="/app/account" className="block rounded-md px-2.5 py-1.5 text-sm text-ink-soft hover:bg-subtle hover:text-ink">
                Account settings
              </Link>
              <form action="/auth/sign-out" method="post">
                <button type="submit" className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink-soft hover:bg-subtle hover:text-ink">
                  Sign out
                </button>
              </form>
            </div>
          </details>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink-soft hover:bg-subtle md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpenOn(open ? null : pathname)}
          >
            <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              {open ? <path d="M5 5l10 10M15 5 5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>
      {open ? (
        <div id="mobile-menu" className="border-t border-line bg-surface md:hidden">
          <nav aria-label="Main" className="mx-auto max-w-6xl px-2 py-2">
            {items.map((item) => {
              const active = isActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-11 items-center rounded-md px-3 text-[15px] font-medium ${
                    active ? "bg-subtle text-ink" : "text-ink-soft hover:bg-subtle"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-line px-2 py-2">
            <div className="flex items-center gap-3 px-3 py-2">
              <Initials name={name || email} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{name}</p>
                <p className="truncate text-xs text-muted">{email}</p>
              </div>
            </div>
            <Link href="/app/account" className="flex h-11 items-center rounded-md px-3 text-[15px] text-ink-soft hover:bg-subtle">
              Account settings
            </Link>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="flex h-11 w-full items-center rounded-md px-3 text-left text-[15px] text-ink-soft hover:bg-subtle">
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function NotificationsBell({ unread, active }: { unread: number; active: boolean }) {
  return (
    <Link
      href="/app/notifications"
      className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors md:h-9 md:w-9 ${
        active ? "bg-subtle text-ink" : "text-ink-soft hover:bg-subtle hover:text-ink"
      }`}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      data-testid="notifications-link"
    >
      <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[18px] w-[18px]">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8a5 5 0 0 1 10 0v3.3l1.3 2.2a.6.6 0 0 1-.5.9H4.2a.6.6 0 0 1-.5-.9L5 11.3V8ZM8 16.5a2.1 2.1 0 0 0 4 0" />
      </svg>
      {unread > 0 ? (
        <span className="tabular absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-surface">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

function Initials({ name }: { name: string }) {
  const letters = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
      {letters}
    </span>
  );
}

export function SubNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Section" className="-mx-4 mb-6 flex gap-5 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 py-2.5 text-sm font-medium transition-colors ${
              active ? "border-navy text-ink" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
