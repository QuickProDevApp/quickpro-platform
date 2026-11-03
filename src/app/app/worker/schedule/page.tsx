import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleStats, WeekNav, WorkerWeek, workerWeekStats } from "@/components/app/week-schedule";
import { marketToday, resolveWeek } from "@/lib/schedule";
import { requireUser } from "@/server/auth/session";
import { getMyAvailability, getWorkerSchedule } from "@/server/data/schedule";

export const metadata: Metadata = { title: "Schedule" };

export default async function WorkerSchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireUser();
  const today = marketToday();
  const week = resolveWeek((await searchParams).week, today);
  const [shifts, availability] = await Promise.all([
    getWorkerSchedule(user.id, week.start, week.end),
    getMyAvailability(user.id),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Your booked shifts and offers waiting for an answer, with the hours you said you’re usually available. Times
          are New York time.
          {availability.length ? null : (
            <>
              {" "}
              <Link href="/app/worker/availability" className="font-medium text-brand hover:underline">
                Add your availability
              </Link>{" "}
              to see it here.
            </>
          )}
        </p>
        <a
          href="/app/worker/schedule/calendar.ics"
          download
          className="inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium text-ink-soft ring-1 ring-inset ring-line hover:bg-subtle"
        >
          Download booked shifts (.ics)
        </a>
      </div>
      <WeekNav week={week} basePath="/app/worker/schedule" />
      <ScheduleStats items={workerWeekStats(shifts)} />
      <WorkerWeek week={week} today={today} shifts={shifts} availability={availability} />
      <p className="text-[13px] text-muted">
        The calendar file has your booked shifts for the next 90 days, with site addresses. Open it with Google
        Calendar, Apple Calendar or Outlook. It doesn’t update itself, so download it again after your schedule changes.
      </p>
    </div>
  );
}
