"use client";

import { useState } from "react";
import { PhoneFrame, ScreenFrame } from "./frames";

type Step = {
  title: string;
  body: string;
  detail: string;
  image: { src: string; alt: string; width: number; height: number; phone?: boolean };
};

/** Three steps; choosing one swaps the screen beside it. */
export function HowItWorks({ steps }: { steps: Step[] }) {
  const [active, setActive] = useState(0);
  const s = steps[active];
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-16">
      <ol className="relative">
        {steps.map((step, i) => {
          const on = i === active;
          return (
            <li key={step.title} className="relative pl-14">
              {i < steps.length - 1 ? (
                <span aria-hidden className="absolute top-10 bottom-0 left-[17px] w-px bg-ink/10">
                  <span
                    className="block w-px bg-signal transition-[height] duration-500"
                    style={{ height: i < active ? "100%" : "0%" }}
                  />
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={on}
                className="group block w-full pb-9 text-left"
              >
                <span
                  className={`tabular absolute top-0 left-0 flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-semibold transition-colors ${
                    on || i < active ? "bg-ink text-white" : "bg-surface text-ink-soft ring-1 ring-ink/15 group-hover:ring-ink/30"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`block pt-1.5 text-[18px] font-semibold tracking-[-0.01em] transition-colors ${on ? "text-ink" : "text-ink-soft group-hover:text-ink"}`}>
                  {step.title}
                </span>
                <span className="mt-1.5 block text-[15px] leading-7 text-muted">{step.body}</span>
                <span
                  className={`block overflow-hidden text-[14px] leading-6 text-ink-soft transition-[max-height,opacity,margin] duration-300 ${
                    on ? "mt-3 max-h-40 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  {step.detail}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="rounded-[14px] bg-[#eef0f3] p-4 sm:p-8">
        <div key={active} className="animate-[qp-fade_420ms_ease-out]">
          {s.image.phone ? (
            <PhoneFrame src={s.image.src} alt={s.image.alt} className="mx-auto w-[min(17rem,72%)]" />
          ) : (
            <ScreenFrame {...s.image} />
          )}
        </div>
      </div>
    </div>
  );
}
