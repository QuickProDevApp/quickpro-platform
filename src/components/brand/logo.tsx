import Link from "next/link";

/**
 * The QuickPro mark: a white "Q" ring on a QuickPro-orange tile, with a short
 * dark tail, the moment a request turns into work.
 */
export function LogoMark({ inverted = false, size = 24 }: { inverted?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#e2561a" />
      <circle cx="11.4" cy="11.4" r="5.2" fill="none" stroke="#ffffff" strokeWidth="2.5" />
      <path d="M14.7 14.7 18.4 18.4" stroke={inverted ? "#ffffff" : "#15191e"} strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", inverted = false }: { href?: string; inverted?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-sm" aria-label="QuickPro home">
      <LogoMark inverted={inverted} />
      <span className={`text-[17px] font-bold tracking-[-0.03em] ${inverted ? "text-white" : "text-ink"}`}>QuickPro</span>
    </Link>
  );
}
