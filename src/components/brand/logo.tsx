import Link from "next/link";

export function Logo({ href = "/", inverted = false }: { href?: string; inverted?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label="QuickPro home">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill={inverted ? "#ffffff" : "#0f2147"} />
        <path
          d="M7 12.4 10.6 16 17.2 8.4"
          fill="none"
          stroke={inverted ? "#0f2147" : "#ffffff"}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`text-[16px] font-semibold tracking-[-0.02em] ${inverted ? "text-white" : "text-ink"}`}>
        QuickPro
      </span>
    </Link>
  );
}
