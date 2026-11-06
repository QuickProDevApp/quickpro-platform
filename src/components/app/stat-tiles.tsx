import Link from "next/link";

export type StatTile = {
  label: string;
  value: string | number;
  href: string;
  /** Short line under the label, such as what to do next. */
  hint?: string;
  /** Draws the eye when something is waiting on the viewer. */
  highlight?: boolean;
  icon: "inbox" | "hammer" | "calendar" | "handshake" | "invoice" | "quote" | "check";
};

const ICONS: Record<StatTile["icon"], React.ReactNode> = {
  inbox: (
    <path d="M4 13.5 6.2 5.8A1.5 1.5 0 0 1 7.6 4.7h8.8a1.5 1.5 0 0 1 1.4 1.1L20 13.5M4 13.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18v-4.5M4 13.5h4.5l1.2 2h4.6l1.2-2H20" />
  ),
  hammer: (
    <>
      <path d="m13.5 9.5-8 8a1.6 1.6 0 0 0 2.3 2.3l8-8" />
      <path d="m11.5 7.5 3.7-3.2a2 2 0 0 1 2.6 0l2.4 2.1-1.8 1.8-1.4-.9-2.7 2.9" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  handshake: (
    <path d="m3.5 11 3-3 3.5 1 2-1.5 3 .5 5.5 3.5M7 14.5l2.5 2.5a1.4 1.4 0 0 0 2-2M10 13.5l3 3a1.4 1.4 0 0 0 2-2l-2.5-2.5M13 12.5l2 2a1.4 1.4 0 0 0 2-2l-3-3" />
  ),
  invoice: (
    <>
      <path d="M6.5 3.5h11v17l-2.75-1.6L12 20.5l-2.75-1.6L6.5 20.5Z" />
      <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
    </>
  ),
  quote: (
    <>
      <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17H11l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z" />
      <path d="M8 10h8M8 13h5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </>
  ),
};

/** A row of linked counts at the top of a dashboard. Every value is live data. */
export function StatTiles({ tiles, testId }: { tiles: StatTile[]; testId?: string }) {
  const cols = tiles.length >= 4 ? "lg:grid-cols-4" : tiles.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
  return (
    <div className={`grid grid-cols-2 gap-3 ${cols}`} data-testid={testId}>
      {tiles.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={`group relative flex flex-col rounded-xl bg-surface p-4 ring-1 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_10px_24px_-16px_rgba(21,25,30,0.35)] sm:p-5 ${
            t.highlight ? "ring-brand/40" : "ring-line hover:ring-line-strong"
          }`}
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              t.highlight ? "bg-brand text-white" : "bg-subtle text-ink-soft"
            }`}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {ICONS[t.icon]}
            </svg>
          </span>
          <span className="tabular mt-3 block text-[26px] leading-8 font-bold tracking-[-0.025em] text-ink">
            {t.value}
          </span>
          <span className="block text-[13px] leading-5 font-medium text-ink-soft">{t.label}</span>
          {t.hint ? (
            <span
              className={`mt-0.5 block text-[12.5px] leading-5 ${t.highlight ? "font-medium text-brand" : "text-muted"}`}
            >
              {t.hint}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
