import type { ReactNode } from "react";

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-[44rem]">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold tracking-[0.08em] text-signal-ink uppercase">
        <span aria-hidden className="h-[7px] w-[7px] bg-signal" />
        {eyebrow}
      </p>
      <h1 className="mt-5 font-display text-[38px] leading-[1.06] font-semibold tracking-[-0.025em] text-balance sm:text-[54px]">{title}</h1>
      {children ? <div className="mt-6 space-y-4 text-[17px] leading-8 text-ink-soft">{children}</div> : null}
    </div>
  );
}
