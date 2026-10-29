import type { Metadata } from "next";
import Link from "next/link";
import { FilterLinks } from "@/components/app/filter-links";
import { ReviewStatusBadge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, type ReviewStatus } from "@/lib/labels";
import { requireAdmin } from "@/server/auth/session";
import { listWorkersForAdmin } from "@/server/data/admin";

export const metadata: Metadata = { title: "Workers" };

const STATUSES: ReviewStatus[] = ["pending_review", "draft", "approved", "rejected", "suspended"];

export default async function AdminWorkersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status);
  const rows = await listWorkersForAdmin(admin.id, { status });
  return (
    <>
      <PageHeader title="Workers" />
      <FilterLinks
        basePath="/app/admin/workers"
        param="status"
        current={status}
        options={[
          { value: undefined, label: "All" },
          { value: "pending_review", label: "In review" },
          { value: "draft", label: "Draft" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Changes requested" },
          { value: "suspended", label: "Suspended" },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No workers match this filter" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.user_id}>
                <Link href={`/app/admin/workers/${r.user_id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="font-medium">{r.full_name || r.email}</p>
                    <p className="text-sm text-muted">
                      {r.headline || "No headline"} · {r.home_area_name ?? "no home area"} ·{" "}
                      {r.submitted_at ? `submitted ${formatDateTime(r.submitted_at)}` : `created ${formatDateTime(r.created_at)}`}
                    </p>
                  </div>
                  <ReviewStatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
