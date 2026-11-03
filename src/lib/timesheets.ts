import { MARKET_TIME_ZONE } from "@/lib/schedule";

// Timesheet helpers (D-038): hours and pay estimates, and the New York
// wall-clock values the approve form edits.

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A `datetime-local` value (YYYY-MM-DDTHH:MM) for this instant in New York time. */
export function localInputValue(date: Date) {
  const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Whole minutes between two instants. */
export function minutesBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

/** "7.5 h", "8 h", "0.25 h": hours to two decimals, trailing zeros dropped. */
export function formatHours(minutes: number) {
  return `${Number((minutes / 60).toFixed(2))} h`;
}

/** Gross pay at an hourly rate, in cents, rounded to the cent. */
export function grossCents(minutes: number, rateCents: number) {
  return Math.round((minutes * rateCents) / 60);
}
