import Link from "next/link";

/**
 * The QuickPro mark: a "Q" ring on a charcoal tile, with a construction-orange
 * tail, the moment a request turns into work.
 */
export function LogoMark({ inverted = false, size = 24 }: { inverted?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill={inverted ? "#f7f6f2" : "#242b31"} />
      <circle cx="11.4" cy="11.4" r="5.2" fill="none" stroke={inverted ? "#242b31" : "#f7f6f2"} strokeWidth="2.4" />
      <path d="M14.6 14.6 18.4 18.4" stroke="#d97835" strokeWidth="2.8" strokeLinecap="square" />
    </svg>
  );
}

export function Logo({ href = "/", inverted = false }: { href?: string; inverted?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-sm" aria-label="QuickPro home">
      <LogoMark inverted={inverted} />
      <span className={`text-[16px] font-semibold tracking-[-0.02em] ${inverted ? "text-white" : "text-ink"}`}>QuickPro</span>
    </Link>
  );
}
