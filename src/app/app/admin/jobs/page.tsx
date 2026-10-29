import type { Metadata } from "next";
import Link from "next/link";
import { FilterLinks } from "@/components/app/filter-links";
import { JobStatusBadge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatCents, formatShift } from "@/lib/labels";
import { requireAdmin } from "@/server/auth/session";
import { listJobsForAdmin, type AdminJobFilter } from "@/server/data/jobs";

export const metadata: Metadata = { title: "Jobs" };

const FILTERS: AdminJobFilter[] = ["attention", "open", "filled", "completed", "cancelled", "all"];

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const admin = await requireAdmin();
  const requested = (await searchParams).show;
  const show = FILTERS.find((f) => f === requested) ?? "attention";
  const jobs = await listJobsForAdmin(admin.id, show);

  return (
    <>
      <PageHeader
        title="Jobs"
        description={show === "attention" ? "Open jobs starting in the next 48 hours that are not filled yet. Match workers by hand from each job." : undefined}
      />
      <FilterLinks
        basePath="/app/admin/jobs"
        param="show"
        current={show === "attention" ? undefined : show}
        options={[
          { value: undefined, label: "Unfilled, starting soon" },
          { value: "open", label: "Open" },
          { value: "filled", label: "Filled" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
          { value: "all", label: "All" },
        ]}
      />
      <Card>
        {jobs.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No jobs match this filter" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={`/app/admin/jobs/${j.id}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="font-medium">{j.title}</p>
                    <p className="text-sm text-muted">
                      {j.business_name} · {formatShift(j.starts_at, j.ends_at)} · {j.area_name} · {formatCents(j.pay_rate_cents)}/hr
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="tabular-nums text-ink-soft">
                      {j.accepted_count}/{j.headcount} booked
                    </span>
                    <JobStatusBadge job={j} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
