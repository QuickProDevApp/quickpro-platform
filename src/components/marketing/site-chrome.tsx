import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { MobileMenu } from "./mobile-menu";

const nav = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#businesses", label: "For businesses" },
  { href: "/#workers", label: "For workers" },
  { href: "/#features", label: "Features" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/[0.07] bg-paper/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="text-[14px] text-ink-soft transition-colors hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/sign-in" className="rounded-md px-3 py-2 text-[14px] font-medium text-ink-soft transition-colors hover:text-ink">
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-[14px] font-medium text-white transition-colors hover:bg-navy"
          >
            Get started
          </Link>
        </div>
        <MobileMenu items={nav} />
      </div>
    </header>
  );
}

const footer = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#trust", label: "Trust and safety" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/sign-up?as=contractor", label: "Register a business" },
      { href: "/sign-up?as=customer", label: "Request service" },
      { href: "/sign-up?as=worker", label: "Find work" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/sign-in", label: "Log in" },
      { href: "/forgot-password", label: "Reset your password" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/[0.08] bg-paper">
      <div className="mx-auto max-w-[1200px] px-5 pt-14 pb-10 sm:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="col-span-2 max-w-xs md:col-span-1">
            <Logo />
            <p className="mt-4 text-[14px] leading-6 text-muted">
              The marketplace for commercial service work on Long Island, starting in Suffolk County, New York.
            </p>
          </div>
          {footer.map((col) => (
            <div key={col.title}>
              <p className="text-[13px] font-medium text-ink">{col.title}</p>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[14px] text-muted transition-colors hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.08] pt-6 text-[13px] text-muted">
          <span>© {new Date().getFullYear()} QuickPro</span>
          <span>Suffolk County, New York</span>
        </div>
      </div>
    </footer>
  );
}
