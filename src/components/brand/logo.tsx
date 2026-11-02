import Link from "next/link";

/**
 * The QuickPro mark: a "Q" ring with a signal-orange tail, the moment a
 * request turns into work.
 */
export function LogoMark({ inverted = false, size = 24 }: { inverted?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill={inverted ? "#ffffff" : "#0f2147"} />
      <circle cx="11.4" cy="11.4" r="5.2" fill="none" stroke={inverted ? "#0f2147" : "#ffffff"} strokeWidth="2.3" />
      <path d="M14.6 14.6 18.2 18.2" stroke="#ef6a32" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", inverted = false }: { href?: string; inverted?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label="QuickPro home">
      <LogoMark inverted={inverted} />
      <span className={`text-[16px] font-semibold tracking-[-0.02em] ${inverted ? "text-white" : "text-ink"}`}>
        QuickPro
      </span>
    </Link>
  );
}
