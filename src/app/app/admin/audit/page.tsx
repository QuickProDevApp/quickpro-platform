import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { requireAdmin } from "@/server/auth/session";
import { listAuditLog } from "@/server/data/admin";

export const metadata: Metadata = { title: "Audit log" };

const ENTITY_TYPES = [
  "organization",
  "organization_member",
  "contractor_service",
  "contractor_service_area",
  "worker_profile",
  "worker_skill",
  "worker_service_area",
  "worker_availability",
  "qualification_document",
  "profile",
];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string; organization?: string; before?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const filter = {
    entityType: ENTITY_TYPES.find((t) => t === params.entityType),
    entityId: params.entityId && uuid.safeParse(params.entityId).success ? params.entityId : undefined,
    organizationId: params.organization && uuid.safeParse(params.organization).success ? params.organization : undefined,
    before: params.before && /^\d+$/.test(params.before) ? params.before : undefined,
  };
  const entries = await listAuditLog(admin.id, filter);
  const nextQuery = new URLSearchParams();
  if (filter.entityType) nextQuery.set("entityType", filter.entityType);
  if (filter.entityId) nextQuery.set("entityId", filter.entityId);
  if (filter.organizationId) nextQuery.set("organization", filter.organizationId);
  if (entries.length === 100) nextQuery.set("before", entries[entries.length - 1].id);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change to business data, recorded by the database in the same transaction. Newest first."
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" action="/app/admin/audit">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Entity type</span>
          <select name="entityType" defaultValue={filter.entityType ?? ""} className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm">
            <option value="">All</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {filter.organizationId ? <input type="hidden" name="organization" value={filter.organizationId} /> : null}
        <button className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm hover:bg-canvas" type="submit">
          Filter
        </button>
        {filter.entityType || filter.entityId || filter.organizationId ? (
          <Link href="/app/admin/audit" className="px-2 text-sm text-brand hover:underline">
            Clear filters
          </Link>
        ) : null}
      </form>
      <Card>
        {entries.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No entries" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    <span className="font-mono text-xs font-medium text-ink">{e.action}</span>
                    <span className="text-muted"> by {e.actor_email ?? `system (${e.db_role})`}</span>
                  </p>
                  <time className="text-xs text-muted">{formatDateTime(e.occurred_at)}</time>
                </div>
                <p className="mt-0.5 font-mono text-xs break-all text-muted">
                  {e.entity_type} {e.entity_id}
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-brand">Changes</summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-canvas p-2 text-xs whitespace-pre-wrap">
                    {JSON.stringify(e.changes, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {nextQuery.has("before") ? (
        <div className="mt-4">
          <Link href={`/app/admin/audit?${nextQuery}`} className="text-sm font-medium text-brand hover:underline">
            Older entries →
          </Link>
        </div>
      ) : null}
    </>
  );
}
