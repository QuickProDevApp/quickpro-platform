import type { Metadata } from "next";
import { WorkerTimesheetList, timesheetTotals } from "@/components/app/timesheets";
import { ScheduleStats, WeekNav } from "@/components/app/week-schedule";
import { formatCents } from "@/lib/labels";
import { marketToday, resolveWeek } from "@/lib/schedule";
import { formatHours } from "@/lib/timesheets";
import { requireUser } from "@/server/auth/session";
import { queryTimesheetAction } from "@/server/actions/timesheets";
import { listMyTimesheets } from "@/server/data/timesheets";

export const metadata: Metadata = { title: "Timesheets" };

export default async function WorkerTimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireUser();
  const week = resolveWeek((await searchParams).week, marketToday());
  const rows = await listMyTimesheets(user.id, week.start, week.end);
  const totals = timesheetTotals(rows);

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-ink-soft">
        The hours each business approved for your shifts. Pay shown is an estimate of gross pay at the job&apos;s rate,
        before taxes and deductions; the business that engaged you pays you through its own payroll, not through
        QuickPro. If hours look wrong, question them within 30 days.
      </p>
      <WeekNav week={week} basePath="/app/worker/timesheets" />
      <ScheduleStats
        items={[
          { label: "Approved hours", value: formatHours(totals.minutes), note: "this week" },
          { label: "Estimated gross", value: formatCents(totals.cents), note: "before taxes" },
          {
            label: "Waiting",
            value: String(totals.pending),
            note: totals.pending === 1 ? "shift to be approved" : "shifts to be approved",
          },
          { label: "Questioned", value: String(totals.queried), note: "being looked at" },
        ]}
      />
      <WorkerTimesheetList rows={rows} queryAction={queryTimesheetAction} />
    </div>
  );
}
