import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { formatCents, formatTime, shiftHours } from "@/lib/labels";
import { dayOfMonth, formatDayHeading, formatWeekdayShort, type ScheduleWeek } from "@/lib/schedule";
import type { AvailabilityWindow, ScheduledJob, ScheduledShift } from "@/server/data/schedule";

const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});
const span = (start: Date, end: Date) => `${timeFormat.format(start)} – ${timeFormat.format(end)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Previous, this and next week. The week is in the address (?week=YYYY-MM-DD), so it can be shared or bookmarked. */
export function WeekNav({ week, basePath }: { week: ScheduleWeek; basePath: string }) {
  const link =
    "inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium ring-1 ring-inset ring-line hover:bg-subtle";
  return (
    <nav aria-label="Week" className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink" data-testid="week-label">
        {week.label}
      </h2>
      <div className="flex items-center gap-1.5">
        <Link href={`${basePath}?week=${week.previous}`} className={`${link} text-ink-soft`}>
          <span aria-hidden>←</span>
          <span className="ml-1">Previous</span>
          <span className="sr-only"> week</span>
        </Link>
        {week.isCurrent ? (
          <span className={`${link} text-faint`} aria-current="page">
            This week
          </span>
        ) : (
          <Link href={basePath} className={`${link} text-ink-soft`}>
            This week
          </Link>
        )}
        <Link href={`${basePath}?week=${week.next}`} className={`${link} text-ink-soft`}>
          <span className="mr-1">Next</span>
          <span className="sr-only"> week</span>
          <span aria-hidden>→</span>
        </Link>
      </div>
    </nav>
  );
}

export function ScheduleStats({ items }: { items: { label: string; value: string; note: string; tone?: "warn" }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s) => (
        <Card key={s.label}>
          <CardBody className="!py-3.5">
            <p className="text-xs font-medium tracking-wide text-faint uppercase">{s.label}</p>
            <p className={`tabular mt-1 text-xl font-semibold ${s.tone === "warn" ? "text-warn" : "text-ink"}`}>
              {s.value}
            </p>
            <p className="text-[13px] leading-5 text-muted">{s.note}</p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

/**
 * Seven days. Phones get a list of days, with empty days folded to one line;
 * wide screens get seven columns.
 */
function WeekDays<T>({
  week,
  today,
  items,
  dateOf,
  renderItem,
  keyOf,
  dayNote,
  emptyText,
}: {
  week: ScheduleWeek;
  today: string;
  items: T[];
  dateOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  keyOf: (item: T) => string;
  dayNote?: (date: string) => React.ReactNode;
  emptyText: string;
}) {
  return (
    <ol className="grid gap-2 lg:grid-cols-7 lg:gap-2.5" aria-label={`Days, ${week.label}`}>
      {week.days.map((date) => {
        const dayItems = items.filter((i) => dateOf(i) === date);
        const isToday = date === today;
        const past = date < today;
        const note = dayNote?.(date);
        return (
          <li
            key={date}
            data-testid="schedule-day"
            data-date={date}
            className={`rounded-lg border bg-surface lg:min-h-48 ${isToday ? "border-brand/50 ring-1 ring-brand/20" : "border-line"} ${
              !dayItems.length ? "max-lg:bg-transparent" : ""
            }`}
          >
            <h3 className="flex items-baseline justify-between gap-2 px-3 pt-2.5 pb-1.5 lg:block">
              <span className={`text-[13px] font-semibold ${past ? "text-muted" : "text-ink"}`}>
                <span className="lg:hidden">{formatDayHeading(date)}</span>
                <span className="hidden lg:inline">
                  {formatWeekdayShort(date)} <span className="tabular">{dayOfMonth(date)}</span>
                </span>
                {isToday ? <span className="ml-1.5 text-xs font-medium text-brand">Today</span> : null}
              </span>
              {!dayItems.length ? <span className="text-[13px] text-faint lg:mt-0.5 lg:block">{emptyText}</span> : null}
            </h3>
            {note ? <div className="px-3 pb-1.5 text-xs text-muted">{note}</div> : null}
            {dayItems.length ? (
              <ul className="space-y-2 px-2 pb-2">
                {dayItems.map((i) => (
                  <li key={keyOf(i)}>{renderItem(i)}</li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function needsCrew(j: ScheduledJob, now: Date) {
  return j.status === "open" && j.starts_at > now && j.booked < j.headcount;
}

const blockClass = "block rounded-md border px-2.5 py-2 text-[13px] transition-colors";

/** A contractor's week: each job with its time, town, crew, and whether it still needs people. */
export function ContractorWeek({
  week,
  today,
  jobs,
  jobHref,
}: {
  week: ScheduleWeek;
  today: string;
  jobs: ScheduledJob[];
  jobHref: (id: string) => string;
}) {
  const now = new Date();
  return (
    <WeekDays
      week={week}
      today={today}
      items={jobs}
      dateOf={(j) => j.local_date}
      keyOf={(j) => j.id}
      emptyText="No jobs"
      renderItem={(j) => {
        const short = needsCrew(j, now);
        const soon = short && j.starts_at.getTime() - now.getTime() < 48 * 3_600_000;
        const booked = j.crew.filter((c) => c.status !== "offered");
        const offered = j.crew.filter((c) => c.status === "offered");
        return (
          <Link
            href={jobHref(j.id)}
            data-testid="schedule-job"
            className={`${blockClass} ${
              j.status === "completed"
                ? "border-line bg-subtle/60 hover:bg-subtle"
                : soon
                  ? "border-bad/30 bg-bad-soft hover:border-bad/50"
                  : short
                    ? "border-warn/30 bg-warn-soft hover:border-warn/50"
                    : "border-line bg-canvas hover:border-line-strong"
            }`}
          >
            <span className="tabular block text-xs text-muted">{span(j.starts_at, j.ends_at)}</span>
            <span className="mt-0.5 block font-medium leading-snug text-ink">{j.title}</span>
            <span className="block text-xs text-muted">
              {j.area_name}
              {j.project_title ? ` · ${j.project_title}` : ""}
            </span>
            <span
              className={`tabular mt-1.5 block text-xs font-medium ${
                j.status === "completed" ? "text-muted" : soon ? "text-bad" : short ? "text-warn" : "text-ok"
              }`}
            >
              {j.status === "completed"
                ? `Completed · ${plural(j.booked, "person", "people")}`
                : `${j.booked}/${j.headcount} booked${short ? (soon ? " · starts soon" : " · needs crew") : ""}`}
            </span>
            {booked.length || offered.length ? (
              <span className="mt-1 block text-xs leading-snug text-ink-soft">
                {booked.map((c) => c.name).join(", ")}
                {offered.length ? (
                  <span className="text-muted">
                    {booked.length ? " · " : ""}
                    {plural(offered.length, "offer")} out
                  </span>
                ) : null}
              </span>
            ) : j.applicants && j.status === "open" ? (
              <span className="mt-1 block text-xs text-ink-soft">{plural(j.applicants, "applicant")} to review</span>
            ) : null}
          </Link>
        );
      }}
    />
  );
}

export function contractorWeekStats(jobs: ScheduledJob[]) {
  const now = new Date();
  const seats = jobs.reduce((n, j) => n + j.headcount, 0);
  const booked = jobs.reduce((n, j) => n + Math.min(j.booked, j.headcount), 0);
  const short = jobs.filter((j) => needsCrew(j, now));
  const open = short.reduce((n, j) => n + (j.headcount - j.booked), 0);
  const hours = jobs.reduce((n, j) => n + j.booked * shiftHours(j.starts_at, j.ends_at), 0);
  return [
    {
      label: "Jobs",
      value: String(jobs.length),
      note: jobs.length ? `${plural(seats, "shift")} to staff` : "Nothing scheduled",
    },
    {
      label: "Booked",
      value: `${booked}/${seats}`,
      note: seats ? `${Math.round((booked / seats) * 100)}% of shifts filled` : "No shifts",
    },
    {
      label: "Still to staff",
      value: String(open),
      note: short.length ? `On ${plural(short.length, "job")} not yet started` : "Every upcoming shift is booked",
      tone: open ? ("warn" as const) : undefined,
    },
    { label: "Crew hours", value: String(Math.round(hours * 10) / 10), note: "Booked people × shift length" },
  ];
}

const SHIFT_LABEL: Record<ScheduledShift["status"], string> = {
  offered: "Offer waiting for you",
  accepted: "Booked",
  completed: "Worked",
};

/** A worker's week: booked and worked shifts, offers waiting, and their usual availability. */
export function WorkerWeek({
  week,
  today,
  shifts,
  availability,
}: {
  week: ScheduleWeek;
  today: string;
  shifts: ScheduledShift[];
  availability: AvailabilityWindow[];
}) {
  return (
    <WeekDays
      week={week}
      today={today}
      items={shifts}
      dateOf={(s) => s.local_date}
      keyOf={(s) => s.assignment_id}
      emptyText="No shifts"
      dayNote={(date) => {
        const windows = availability.filter((w) => w.weekday === new Date(`${date}T12:00:00Z`).getUTCDay());
        if (!windows.length) return null;
        return (
          <span data-testid="availability-note">
            Available {windows.map((w) => `${formatTime(w.start_time)} – ${formatTime(w.end_time)}`).join(", ")}
          </span>
        );
      }}
      renderItem={(s) => (
        <Link
          href={`/app/worker/jobs/${s.job_id}`}
          data-testid="schedule-shift"
          className={`${blockClass} ${
            s.status === "offered"
              ? "border-brand/30 bg-brand-soft hover:border-brand/50"
              : s.status === "completed" || s.job_status === "completed"
                ? "border-line bg-subtle/60 hover:bg-subtle"
                : "border-line bg-canvas hover:border-line-strong"
          }`}
        >
          <span className="tabular block text-xs text-muted">{span(s.starts_at, s.ends_at)}</span>
          <span className="mt-0.5 block font-medium leading-snug text-ink">{s.title}</span>
          <span className="block text-xs text-muted">
            {s.organization_name ?? "Contractor"} · {s.area_name}
          </span>
          <span
            className={`mt-1.5 block text-xs font-medium ${s.status === "offered" ? "text-brand" : s.status === "completed" ? "text-muted" : "text-ok"}`}
          >
            {s.checked_in_at && !s.checked_out_at ? "Checked in" : SHIFT_LABEL[s.status]}
            <span className="tabular font-normal text-muted"> · {formatCents(s.pay_rate_cents)}/hr</span>
          </span>
        </Link>
      )}
    />
  );
}

export function workerWeekStats(shifts: ScheduledShift[]) {
  const working = shifts.filter((s) => s.status !== "offered");
  const offers = shifts.length - working.length;
  const hours = working.reduce((n, s) => n + shiftHours(s.starts_at, s.ends_at), 0);
  const pay = working.reduce((n, s) => n + Math.round(s.pay_rate_cents * shiftHours(s.starts_at, s.ends_at)), 0);
  return [
    { label: "Shifts", value: String(working.length), note: working.length ? "Booked or worked" : "Nothing booked" },
    { label: "Hours", value: String(Math.round(hours * 10) / 10), note: "Scheduled shift length" },
    { label: "Estimated pay", value: formatCents(pay), note: "At posted rates, before taxes" },
    {
      label: "Offers",
      value: String(offers),
      note: offers ? "Waiting for your answer" : "None waiting",
      tone: offers ? ("warn" as const) : undefined,
    },
  ];
}
