"use client";

import { useState } from "react";

export type ActivityColumn = {
  /** Shown under the column and in the tooltip, e.g. "Oct 5". */
  label: string;
  /** Longer form for the tooltip and screen readers, e.g. "Week of Oct 5". */
  title: string;
  /** The emphasised part (filled, awarded). */
  part: number;
  /** The whole (positions, requests); part never exceeds it. */
  total: number;
};

/**
 * Stacked columns of one part against its whole over time, such as filled
 * against posted positions. The part is in the brand colour and the rest in
 * gray, with a legend, a tooltip on hover or focus, and a table view.
 */
export function ActivityChart({
  columns,
  partLabel,
  restLabel,
  totalLabel,
  emptyText,
}: {
  columns: ActivityColumn[];
  partLabel: string;
  restLabel: string;
  totalLabel: string;
  emptyText: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...columns.map((c) => c.total), 0);
  const top = niceMax(max);
  const everyOther = columns.length > 8;

  if (max === 0) {
    return <p className="rounded-md bg-subtle/70 px-4 py-8 text-center text-sm text-muted">{emptyText}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-brand" /> {partLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-line-strong" /> {restLabel}
        </span>
      </div>
      <div className="relative">
        {/* Gridlines: the top value and the midpoint. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40" aria-hidden>
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
          <span className="tabular absolute -top-2.5 right-0 bg-surface pl-1 text-[11px] text-faint">{top}</span>
          <span className="tabular absolute top-[calc(50%-0.625rem)] right-0 bg-surface pl-1 text-[11px] text-faint">{top / 2}</span>
        </div>
        <ol className="relative flex h-40 items-end gap-0.5 border-b border-line-strong pr-7" aria-label={`${totalLabel} by period`}>
          {columns.map((c, i) => {
            const whole = (c.total / top) * 100;
            const part = c.total ? (c.part / c.total) * 100 : 0;
            const description = `${c.title}: ${c.part} of ${c.total} ${totalLabel.toLowerCase()} ${partLabel.toLowerCase()}`;
            return (
              <li
                key={c.title}
                className="group relative flex h-full flex-1 items-end justify-center outline-none"
                tabIndex={0}
                aria-label={description}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                data-testid="activity-column"
              >
                {c.total > 0 ? (
                  <span
                    className={`flex w-full max-w-6 flex-col overflow-hidden rounded-t-[4px] transition-opacity ${
                      active !== null && active !== i ? "opacity-60" : ""
                    } group-focus-visible:ring-2 group-focus-visible:ring-brand/40`}
                    style={{ height: `${whole}%` }}
                  >
                    <span className="w-full bg-line-strong" style={{ height: `${100 - part}%` }} />
                    {c.part > 0 && c.part < c.total ? <span className="h-[2px] w-full shrink-0 bg-surface" /> : null}
                    <span className="w-full bg-brand" style={{ height: `${part}%` }} />
                  </span>
                ) : null}
                {active === i ? (
                  <span
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-[11rem] rounded-md bg-charcoal px-2.5 py-1.5 text-xs text-white/80 shadow-lg ${
                      i < columns.length / 2 ? "left-0" : "right-0"
                    }`}
                  >
                    <span className="block font-medium text-white">{c.title}</span>
                    <span className="tabular block">
                      <strong className="font-semibold text-white">{c.part}</strong> {partLabel.toLowerCase()} of {c.total}
                      {c.total ? ` (${Math.round((c.part / c.total) * 100)}%)` : ""}
                    </span>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        <ol className="mt-1.5 flex gap-0.5 pr-7" aria-hidden>
          {columns.map((c, i) => (
            <li key={c.title} className="tabular flex-1 truncate text-center text-[11px] text-faint">
              {everyOther && i % 2 === 1 ? "" : c.label}
            </li>
          ))}
        </ol>
      </div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-ink">Show as a table</summary>
        <table className="tabular mt-2 w-full text-left">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-1 font-medium">Period</th>
              <th className="py-1 text-right font-medium">{partLabel}</th>
              <th className="py-1 text-right font-medium">{totalLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {columns.map((c) => (
              <tr key={c.title}>
                <td className="py-1 text-ink-soft">{c.title}</td>
                <td className="py-1 text-right text-ink">{c.part}</td>
                <td className="py-1 text-right text-ink">{c.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** A round axis top at or above the largest column, with a whole-number midpoint: 2, 4, 6, 8, 10, 20, 40, ... */
function niceMax(n: number) {
  if (n <= 2) return 2;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 4, 6, 8, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}
