import type { Metadata } from "next";
import Link from "next/link";
import { FilterLinks } from "@/components/app/filter-links";
import { Badge, ReviewStatusBadge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { INSURANCE_STATUS_LABEL, ORGANIZATION_KIND_LABEL, formatDateTime, type OrganizationKind, type ReviewStatus } from "@/lib/labels";
import { requireAdmin } from "@/server/auth/session";
import { listOrganizationsForAdmin } from "@/server/data/admin";

export const metadata: Metadata = { title: "Organizations" };

const STATUSES: ReviewStatus[] = ["pending_review", "draft", "approved", "rejected", "suspended"];
const KINDS: OrganizationKind[] = ["contractor", "customer"];

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; insurance?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status);
  const kind = KINDS.find((k) => k === params.kind);
  const insuranceAttention = params.insurance === "attention";
  const rows = await listOrganizationsForAdmin(admin.id, { status, kind, insuranceAttention });

  return (
    <>
      <PageHeader
        title="Organizations"
        description={
          insuranceAttention ? "Approved contractors whose general liability certificate is not reviewed and current." : undefined
        }
        actions={
          insuranceAttention ? (
            <Link href="/app/admin/organizations" className="text-sm font-medium text-brand hover:underline">
              Clear insurance filter
            </Link>
          ) : null
        }
      />
      <FilterLinks
        basePath="/app/admin/organizations"
        param="status"
        current={status}
        extra={{ kind }}
        options={[
          { value: undefined, label: "All statuses" },
          { value: "pending_review", label: "In review" },
          { value: "draft", label: "Draft" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Changes requested" },
          { value: "suspended", label: "Suspended" },
        ]}
      />
      <FilterLinks
        basePath="/app/admin/organizations"
        param="kind"
        current={kind}
        extra={{ status }}
        options={[
          { value: undefined, label: "All types" },
          { value: "contractor", label: "Contractors" },
          { value: "customer", label: "Customers" },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No organizations match these filters" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/app/admin/organizations/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-muted">
                      {ORGANIZATION_KIND_LABEL[r.kind]} · {r.market_name} · {r.owner_email ?? "no owner"} ·{" "}
                      {r.submitted_at ? `submitted ${formatDateTime(r.submitted_at)}` : `created ${formatDateTime(r.created_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.rereview_reason ? <Badge tone="warn">Changed after approval</Badge> : null}
                    {r.insurance_status && r.insurance_status !== "current" && r.status === "approved" ? (
                      <Badge tone="bad">Insurance: {INSURANCE_STATUS_LABEL[r.insurance_status].toLowerCase()}</Badge>
                    ) : null}
                    {r.pending_documents > 0 ? <Badge tone="info">{r.pending_documents} doc{r.pending_documents === 1 ? "" : "s"} to review</Badge> : null}
                    <ReviewStatusBadge status={r.status} />
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
