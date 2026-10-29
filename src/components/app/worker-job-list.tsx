import Link from "next/link";
import { ApplicationStatusBadge, AssignmentStatusBadge, JobStatusBadge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { formatCents, formatShift } from "@/lib/labels";
import type { WorkerJob } from "@/server/data/jobs";

export function WorkerJobList({ jobs, empty, showJobStatus = false }: { jobs: WorkerJob[]; empty: React.ReactNode; showJobStatus?: boolean }) {
  return (
    <Card>
      {jobs.length === 0 ? (
        <div className="p-5">{empty}</div>
      ) : (
        <ul className="divide-y divide-line">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/app/worker/jobs/${j.id}`} className="block space-y-1 px-5 py-4 hover:bg-canvas">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-ink">{j.title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {showJobStatus && j.status !== "open" ? <JobStatusBadge job={j} /> : null}
                    {j.assignment_status ? (
                      <AssignmentStatusBadge status={j.assignment_status} />
                    ) : j.application_status ? (
                      <ApplicationStatusBadge status={j.application_status} />
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-ink-soft">
                  {formatCents(j.pay_rate_cents)}/hr · {formatShift(j.starts_at, j.ends_at)}
                </p>
                <p className="text-sm text-muted">
                  {j.organization_name ?? "Contractor"} · {j.area_name}
                  {j.in_my_areas ? " · In your towns" : ""}
                  {j.skill_names.length ? ` · ${j.matching_skills}/${j.skill_names.length} skills match` : ""}
                </p>
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
