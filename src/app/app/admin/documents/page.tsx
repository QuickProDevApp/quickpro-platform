import type { Metadata } from "next";
import Link from "next/link";
import { FilterLinks } from "@/components/app/filter-links";
import { DocumentStatusBadge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DOCUMENT_TYPE_LABEL, formatDate, formatDateTime, type DocumentStatus } from "@/lib/labels";
import { requireAdmin } from "@/server/auth/session";
import { listDocumentQueue } from "@/server/data/admin";

export const metadata: Metadata = { title: "Documents" };

const STATUSES: DocumentStatus[] = ["pending", "approved", "rejected"];

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; expiring?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const expiring = params.expiring === "1";
  const status = expiring ? undefined : STATUSES.find((s) => s === params.status);
  const rows = await listDocumentQueue(admin.id, { status, expiring });
  return (
    <>
      <PageHeader title="Documents" description="Open the owner to review a document alongside the rest of their registration." />
      <FilterLinks
        basePath="/app/admin/documents"
        param="status"
        current={expiring ? "expiring" : status}
        options={[
          { value: "pending", label: "Awaiting review" },
          { value: "approved", label: "Reviewed" },
          { value: "rejected", label: "Not accepted" },
          { value: undefined, label: "All" },
        ]}
      />
      <p className="-mt-2 mb-4 text-sm">
        <Link href="/app/admin/documents?expiring=1" className={`font-medium hover:underline ${expiring ? "text-ink" : "text-brand"}`}>
          Reviewed documents expiring in the next 30 days
        </Link>
      </p>
      <Card>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nothing here" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={r.owner_href} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="font-medium">{r.owner_name}</p>
                    <p className="text-sm text-muted">
                      {DOCUMENT_TYPE_LABEL[r.doc_type]} · {r.title} · uploaded {formatDateTime(r.created_at)}
                      {r.expires_on ? ` · expires ${formatDate(r.expires_on)}` : ""}
                    </p>
                  </div>
                  <DocumentStatusBadge status={r.status} expiresOn={r.expires_on} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
