import Link from "next/link";
import { LandingLogo } from "./brand";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#for-pros", label: "For contractors" },
      { href: "/#workers", label: "For tradespeople" },
      { href: "/#services", label: "Services" },
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

export function LandingFooter({ disclosure }: { disclosure: string | null }) {
  return (
    <footer className="border-t border-qp-line bg-white">
      <div className="mx-auto max-w-[1240px] px-5 pt-16 pb-10 sm:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="col-span-2 max-w-xs md:col-span-1">
            <LandingLogo size={30} />
            <p className="mt-4 text-[14.5px] leading-6 text-qp-slate">Contractors, trades and crews for every job, starting in Suffolk County, New York.</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[13px] font-semibold text-qp-navy">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[14.5px] text-qp-slate transition-colors hover:text-qp-blue">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-qp-line pt-6 text-[13px] text-qp-slate sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} QuickPro · Suffolk County, New York</span>
          {disclosure ? <span data-testid="landing-disclosure">{disclosure}</span> : null}
        </div>
      </div>
    </footer>
  );
}
