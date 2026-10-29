import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/server/auth/session";
import { getAdminOverview } from "@/server/data/admin";
import { getJobCountsForAdmin } from "@/server/data/jobs";

export const metadata: Metadata = { title: "Staff overview" };

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  const [o, jobs] = await Promise.all([getAdminOverview(admin.id), getJobCountsForAdmin(admin.id)]);
  const queues = [
    { label: "Open jobs starting within 48 hours, not filled", value: jobs.unfilled_soon, href: "/app/admin/jobs" },
    { label: "Organizations awaiting review", value: o.pending_organizations, href: "/app/admin/organizations?status=pending_review" },
    { label: "Workers awaiting review", value: o.pending_workers, href: "/app/admin/workers?status=pending_review" },
    { label: "Documents awaiting review", value: o.pending_documents, href: "/app/admin/documents?status=pending" },
    { label: "Reviewed documents expiring in 30 days", value: o.expiring_documents, href: "/app/admin/documents?expiring=1" },
    {
      label: "Approved contractors without current reviewed insurance",
      value: o.contractors_without_current_insurance,
      href: "/app/admin/organizations?insurance=attention",
    },
  ];
  return (
    <>
      <PageHeader title="Needs attention" description="Live counts from the database. Oldest submissions are listed first in each queue." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {queues.map((q) => (
          <Link key={q.label} href={q.href} className="group">
            <Card className={`h-full p-5 transition-shadow group-hover:shadow-md ${q.value > 0 ? "border-brand/40" : ""}`}>
              <p className="text-3xl font-semibold tabular-nums">{q.value}</p>
              <p className="mt-1 text-sm text-muted">{q.label}</p>
            </Card>
          </Link>
        ))}
      </div>
      <h2 className="mt-10 mb-3 text-sm font-semibold text-ink-soft">Approved so far</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-2xl font-semibold tabular-nums">{o.approved_contractors}</p>
          <p className="mt-1 text-sm text-muted">Contractor businesses</p>
        </Card>
        <Card className="p-5">
          <p className="text-2xl font-semibold tabular-nums">{o.approved_workers}</p>
          <p className="mt-1 text-sm text-muted">Workers</p>
        </Card>
      </div>
      <h2 className="mt-10 mb-3 text-sm font-semibold text-ink-soft">Jobs</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Open, not started", value: jobs.open_jobs, href: "/app/admin/jobs?show=open" },
          { label: "Filled, not started", value: jobs.filled_upcoming, href: "/app/admin/jobs?show=filled" },
          { label: "Completed in the last 30 days", value: jobs.completed_30d, href: "/app/admin/jobs?show=completed" },
        ].map((c) => (
          <Link key={c.label} href={c.href} className="group">
            <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
              <p className="text-2xl font-semibold tabular-nums">{c.value}</p>
              <p className="mt-1 text-sm text-muted">{c.label}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
