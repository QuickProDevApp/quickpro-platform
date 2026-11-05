import { demoMode } from "@/server/env";

/**
 * Shown on every page of a demonstration environment (DEMO_MODE=on), so
 * example records and test-mode payments are never mistaken for real
 * activity.
 */
export function DemoBanner() {
  if (!demoMode()) return null;
  return (
    <div role="note" aria-label="Demo environment" className="border-b border-signal/25 bg-signal-soft text-[12.5px] leading-5 text-ink-soft" data-testid="demo-banner">
      <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-1.5 sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <span aria-hidden className="h-1.5 w-1.5 rounded-[1px] bg-signal" />
          Demo environment
        </span>
        <span className="sm:hidden">Example records · Stripe test mode, no real money</span>
        <span className="hidden sm:inline">
          Businesses, people and projects here are example records. Card payments run in Stripe test mode; no real money moves.
        </span>
      </p>
    </div>
  );
}
