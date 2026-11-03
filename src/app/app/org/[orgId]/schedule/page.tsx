import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractorWeek, ScheduleStats, WeekNav, contractorWeekStats } from "@/components/app/week-schedule";
import { LinkButton } from "@/components/ui/button";
import { marketToday, resolveWeek } from "@/lib/schedule";
import { requireMembership } from "@/server/actions/guards";
import { canDispatch } from "@/server/data/organizations";
import { getContractorSchedule } from "@/server/data/schedule";

export const metadata: Metadata = { title: "Schedule" };

export default async function OrganizationSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "contractor") notFound();
  const today = marketToday();
  const week = resolveWeek((await searchParams).week, today);
  const jobs = await getContractorSchedule(user.id, org.id, week.start, week.end);
  const base = `/app/org/${org.id}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Every job starting this week, with who is booked. Jobs that still need people are highlighted, in red when
          they start within 48 hours. Times are New York time.
        </p>
        {canDispatch(org.my_role) && org.status === "approved" ? (
          <LinkButton href={`${base}/jobs/new`} variant="secondary">
            Post a job
          </LinkButton>
        ) : null}
      </div>
      <WeekNav week={week} basePath={`${base}/schedule`} />
      <ScheduleStats items={contractorWeekStats(jobs)} />
      <ContractorWeek week={week} today={today} jobs={jobs} jobHref={(id) => `${base}/jobs/${id}`} />
    </div>
  );
}
