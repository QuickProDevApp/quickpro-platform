import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/server/auth/session";
import { getAdminOverview } from "@/server/data/admin";
import { getJobCountsForAdmin } from "@/server/data/jobs";
import { getRequestCountsForAdmin } from "@/server/data/requests";

export const metadata: Metadata = { title: "Staff overview" };

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  const [o, jobs, requests] = await Promise.all([
    getAdminOverview(admin.id),
    getJobCountsForAdmin(admin.id),
    getRequestCountsForAdmin(admin.id),
  ]);
  const queues = [
    { label: "Open jobs starting within 48 hours, not filled", value: jobs.unfilled_soon, href: "/app/admin/jobs" },
    { label: "Service requests open 3+ days without a quote", value: requests.unquoted_stale, href: "/app/admin/requests" },
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
  const open = queues.filter((q) => q.value > 0).length;
  const totals = [
    { label: "Approved contractors", value: o.approved_contractors, href: "/app/admin/organizations?status=approved" },
    { label: "Approved workers", value: o.approved_workers, href: "/app/admin/workers?status=approved" },
    { label: "Open jobs, not started", value: jobs.open_jobs, href: "/app/admin/jobs?show=open" },
    { label: "Filled jobs, not started", value: jobs.filled_upcoming, href: "/app/admin/jobs?show=filled" },
    { label: "Jobs completed in the last 30 days", value: jobs.completed_30d, href: "/app/admin/jobs?show=completed" },
    { label: "Service requests taking quotes", value: requests.open_requests, href: "/app/admin/requests?show=open" },
    { label: "Service requests awarded, not complete", value: requests.awarded_requests, href: "/app/admin/requests?show=awarded" },
  ];
  return (
    <>
    <PageHeader title="Staff overview" description="Suffolk County, NY" />
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader
          title="Needs attention"
          description={open === 0 ? "Every queue is clear." : `${open} of ${queues.length} queues have work waiting. Oldest items are listed first.`}
        />
        <ul className="divide-y divide-line">
          {queues.map((q) => (
            <li key={q.label}>
              <Link href={q.href} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-subtle/60 sm:px-5">
                <span className={`min-w-0 flex-1 text-sm ${q.value > 0 ? "text-ink" : "text-muted"}`}>{q.label}</span>
                <span
                  className={`tabular inline-flex h-6 min-w-8 items-center justify-center rounded-md px-2 text-[13px] font-semibold ${
                    q.value > 0 ? "bg-navy text-white" : "bg-subtle text-faint"
                  }`}
                >
                  {q.value}
                </span>
                <span aria-hidden className="text-faint">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Platform" description="Live counts." />
        <dl className="divide-y divide-line">
          {totals.map((t) => (
            <Link key={t.label} href={t.href} className="flex items-baseline justify-between gap-4 px-4 py-3 transition-colors hover:bg-subtle/60 sm:px-5">
              <dt className="text-sm text-muted">{t.label}</dt>
              <dd className="tabular text-[15px] font-semibold text-ink">{t.value}</dd>
            </Link>
          ))}
        </dl>
      </Card>
    </div>
    </>
  );
}
