// Calendar weeks for the schedule pages, in the market's time zone
// (America/New_York). Weeks run Sunday to Saturday, like US wall calendars
// and the worker availability weekdays (0 = Sunday). All arithmetic is on
// plain calendar dates, so daylight saving changes never shift a day.

export const MARKET_TIME_ZONE = "America/New_York";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

/** Today's calendar date in the market, "YYYY-MM-DD". */
export function marketToday(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: MARKET_TIME_ZONE });
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export function weekday(date: string) {
  return new Date(toUtc(date)).getUTCDay();
}

export type ScheduleWeek = {
  /** The Sunday that starts the week. */
  start: string;
  /** The Saturday that ends it. */
  end: string;
  days: string[];
  previous: string;
  next: string;
  isCurrent: boolean;
  /** "Nov 1 – 7, 2026", "Nov 29 – Dec 5, 2026" or "Dec 27, 2026 – Jan 2, 2027". */
  label: string;
};

function isRealDate(value: string) {
  return ISO_DATE.test(value) && fromUtc(toUtc(value)) === value;
}

/**
 * The week containing `requested` (any day of it), or the current week when
 * it's missing or not a real date. Weeks more than two years away are out of
 * range and also fall back to the current week.
 */
export function resolveWeek(requested: string | undefined, today = marketToday()): ScheduleWeek {
  const currentStart = addDays(today, -weekday(today));
  let start = currentStart;
  if (requested && isRealDate(requested)) {
    const candidate = addDays(requested, -weekday(requested));
    if (Math.abs(toUtc(candidate) - toUtc(currentStart)) <= 730 * 86_400_000) start = candidate;
  }
  const end = addDays(start, 6);
  return {
    start,
    end,
    days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    previous: addDays(start, -7),
    next: addDays(start, 7),
    isCurrent: start === currentStart,
    label: weekLabel(start, end),
  };
}

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const year = (date: string) => date.slice(0, 4);
const month = (date: string) => date.slice(5, 7);
const day = (date: string) => String(Number(date.slice(8, 10)));

function weekLabel(start: string, end: string) {
  if (year(start) !== year(end)) {
    return `${monthDay.format(toUtc(start))}, ${year(start)} – ${monthDay.format(toUtc(end))}, ${year(end)}`;
  }
  if (month(start) !== month(end))
    return `${monthDay.format(toUtc(start))} – ${monthDay.format(toUtc(end))}, ${year(end)}`;
  return `${monthDay.format(toUtc(start))} – ${day(end)}, ${year(end)}`;
}

const dayHeading = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dayShort = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

/** "Tuesday, Nov 3" */
export function formatDayHeading(date: string) {
  return dayHeading.format(toUtc(date));
}

/** "Tue" */
export function formatWeekdayShort(date: string) {
  return dayShort.format(toUtc(date));
}

/** Day of the month without a leading zero: "3". */
export function dayOfMonth(date: string) {
  return day(date);
}
