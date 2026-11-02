import type { ReactNode } from "react";

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-[44rem]">
      <p className="flex items-center gap-2 text-[13px] font-medium text-signal-ink">
        <span aria-hidden className="h-[7px] w-[7px] rounded-[2px] bg-signal" />
        {eyebrow}
      </p>
      <h1 className="mt-4 text-[36px] leading-[1.06] font-semibold tracking-[-0.035em] text-balance sm:text-[52px]">{title}</h1>
      {children ? <div className="mt-6 space-y-4 text-[17px] leading-8 text-ink-soft">{children}</div> : null}
    </div>
  );
}
