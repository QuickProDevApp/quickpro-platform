import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { MobileMenu } from "./mobile-menu";

const nav = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#customers", label: "Customers" },
  { href: "/#contractors", label: "Contractors" },
  { href: "/#workers", label: "Tradespeople" },
  { href: "/contractors", label: "Find contractors" },
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
            className="inline-flex h-9 items-center rounded-[4px] bg-charcoal px-4 text-[14px] font-medium text-white transition-colors hover:bg-charcoal-strong"
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
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#contractors", label: "For contractors" },
      { href: "/#workers", label: "For tradespeople" },
      { href: "/#trust", label: "Trust and safety" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/sign-up?as=customer", label: "Post a project" },
      { href: "/sign-up?as=contractor", label: "Join as a contractor" },
      { href: "/sign-up?as=worker", label: "Find shift work" },
      { href: "/contractors", label: "Find contractors" },
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
    <footer className="on-dark bg-[#1d2328] text-white">
      <div className="mx-auto max-w-[1200px] px-5 pt-14 pb-10 sm:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="col-span-2 max-w-xs md:col-span-1">
            <Logo inverted />
            <p className="mt-4 text-[14px] leading-6 text-white/60">
              The marketplace for commercial construction, skilled trades and the crews behind them, starting in Suffolk County,
              New York.
            </p>
          </div>
          {footer.map((col) => (
            <div key={col.title}>
              <p className="text-[13px] font-semibold text-white">{col.title}</p>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[14px] text-white/60 transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-[13px] text-white/50">
          <span>© {new Date().getFullYear()} QuickPro</span>
          <span>Suffolk County, New York</span>
        </div>
      </div>
    </footer>
  );
}
