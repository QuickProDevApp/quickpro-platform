"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { PhoneFrame, ScreenFrame } from "./frames";

export type Feature = {
  key: string;
  label: string;
  title: string;
  body: string;
  points: string[];
  image: { src: string; alt: string; width: number; height: number; phone?: boolean };
};

/**
 * A tab list of product capabilities beside the matching screen. Arrow keys
 * move between tabs (WAI-ARIA tabs pattern); on phones the tabs scroll
 * sideways above the screen.
 */
export function FeatureTabs({ features }: { features: Feature[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const f = features[active];

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + features.length) % features.length;
    setActive(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14">
      <div
        role="tablist"
        aria-label="QuickPro features"
        aria-orientation="vertical"
        className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0"
      >
        {features.map((x, i) => {
          const selected = i === active;
          return (
            <button
              key={x.key}
              id={`${id}-tab-${i}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={onKey}
              className={`group shrink-0 rounded-full px-3.5 py-2 text-left text-[14px] font-medium whitespace-nowrap transition-colors lg:relative lg:rounded-none lg:border-l lg:px-5 lg:py-4 lg:whitespace-normal ${
                selected
                  ? "bg-ink text-white lg:border-ink lg:bg-transparent lg:text-ink"
                  : "bg-ink/[0.04] text-ink-soft hover:text-ink lg:border-ink/10 lg:bg-transparent"
              }`}
            >
              <span className="block">{x.label}</span>
              <span
                className={`hidden overflow-hidden text-[14px] leading-6 font-normal text-muted transition-[max-height,opacity,margin] duration-300 lg:block ${
                  selected ? "mt-1.5 max-h-40 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                {x.body}
              </span>
            </button>
          );
        })}
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} className="min-w-0">
        <div className="rounded-[14px] bg-[#eef0f3] p-4 sm:p-8">
          <div key={f.key} className="animate-[qp-fade_420ms_ease-out]">
            {f.image.phone ? (
              <PhoneFrame src={f.image.src} alt={f.image.alt} className="mx-auto w-[min(17rem,72%)]" />
            ) : (
              <ScreenFrame {...f.image} />
            )}
          </div>
        </div>
        <div className="mt-6 lg:hidden">
          <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{f.title}</h3>
          <p className="mt-2 text-[15px] leading-7 text-ink-soft">{f.body}</p>
        </div>
        <ul className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {f.points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[14px] leading-6 text-ink-soft">
              <span aria-hidden className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-signal" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
