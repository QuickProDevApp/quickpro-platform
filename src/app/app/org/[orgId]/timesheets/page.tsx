import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrgTimesheetList, timesheetTotals } from "@/components/app/timesheets";
import { ScheduleStats, WeekNav } from "@/components/app/week-schedule";
import { formatCents } from "@/lib/labels";
import { marketToday, resolveWeek } from "@/lib/schedule";
import { formatHours } from "@/lib/timesheets";
import { requireMembership } from "@/server/actions/guards";
import { approveTimesheetAction } from "@/server/actions/timesheets";
import { canDispatch } from "@/server/data/organizations";
import { listOrgTimesheets } from "@/server/data/timesheets";

export const metadata: Metadata = { title: "Timesheets" };

export default async function OrganizationTimesheetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "contractor") notFound();
  const week = resolveWeek((await searchParams).week, marketToday());
  const rows = await listOrgTimesheets(user.id, org.id, week.start, week.end);
  const totals = timesheetTotals(rows);
  const base = `/app/org/${org.id}`;
  const dispatcher = canDispatch(org.my_role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Hours worked on each shift that has ended, from the worker&apos;s check-in and check-out. Approve them as
          recorded or adjust them with a note the worker sees. QuickPro doesn&apos;t run payroll: export approved hours
          for your own. Pay shown is gross, at each job&apos;s rate. Times are New York time.
        </p>
        {totals.minutes > 0 ? (
          <a
            href={`${base}/timesheets/export?week=${week.start}`}
            className="inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium text-ink ring-1 ring-line ring-inset hover:bg-subtle"
          >
            Export approved hours (CSV)
          </a>
        ) : null}
      </div>
      <WeekNav week={week} basePath={`${base}/timesheets`} />
      <ScheduleStats
        items={[
          {
            label: "To approve",
            value: String(totals.pending),
            note: totals.pending === 1 ? "shift waiting" : "shifts waiting",
            tone: totals.pending ? "warn" : undefined,
          },
          {
            label: "Questioned",
            value: String(totals.queried),
            note: "by the worker",
            tone: totals.queried ? "warn" : undefined,
          },
          { label: "Approved hours", value: formatHours(totals.minutes), note: "this week" },
          { label: "Approved pay", value: formatCents(totals.cents), note: "gross, before taxes" },
        ]}
      />
      <OrgTimesheetList
        rows={rows}
        canApprove={dispatcher}
        approveAction={approveTimesheetAction}
        jobHref={(id) => `${base}/jobs/${id}`}
      />
    </div>
  );
}
