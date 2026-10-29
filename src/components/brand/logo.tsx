import Link from "next/link";

export function Logo({ href = "/", inverted = false }: { href?: string; inverted?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label="QuickPro home">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill={inverted ? "#ffffff" : "#1b4fd8"} />
        <path
          d="M8 14.5 12.2 18.5 20 9.5"
          fill="none"
          stroke={inverted ? "#1b4fd8" : "#ffffff"}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`text-[17px] font-semibold tracking-tight ${inverted ? "text-white" : "text-ink"}`}>
        QuickPro
      </span>
    </Link>
  );
}
