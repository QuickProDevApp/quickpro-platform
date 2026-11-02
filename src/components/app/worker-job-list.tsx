import Link from "next/link";
import { ApplicationStatusBadge, AssignmentStatusBadge, JobStatusBadge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { formatCents, formatShift, shiftHours } from "@/lib/labels";
import type { WorkerJob } from "@/server/data/jobs";

export function WorkerJobList({ jobs, empty, showJobStatus = false }: { jobs: WorkerJob[]; empty: React.ReactNode; showJobStatus?: boolean }) {
  return (
    <Card>
      {jobs.length === 0 ? (
        <div className="p-4 sm:p-5">{empty}</div>
      ) : (
        <ul className="divide-y divide-line">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/app/worker/jobs/${j.id}`} className="flex gap-4 px-4 py-4 transition-colors hover:bg-subtle/60 active:bg-subtle sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-medium text-ink">{j.title}</p>
                    {showJobStatus && j.status !== "open" ? <JobStatusBadge job={j} /> : null}
                    {j.assignment_status ? (
                      <AssignmentStatusBadge status={j.assignment_status} />
                    ) : j.application_status ? (
                      <ApplicationStatusBadge status={j.application_status} />
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-soft">{formatShift(j.starts_at, j.ends_at)}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {j.organization_name ?? "Contractor"} · {j.area_name}
                    {j.in_my_areas ? " · In your towns" : ""}
                    {j.skill_names.length ? ` · ${j.matching_skills}/${j.skill_names.length} skills match` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-[15px] font-semibold text-ink">{formatCents(j.pay_rate_cents)}</p>
                  <p className="text-xs text-muted">per hour</p>
                  <p className="tabular mt-1 text-xs text-muted">
                    ≈ {formatCents(Math.round(j.pay_rate_cents * shiftHours(j.starts_at, j.ends_at)))}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NoJobs({ title, children }: { title: string; children?: React.ReactNode }) {
  return <EmptyState title={title}>{children}</EmptyState>;
}
