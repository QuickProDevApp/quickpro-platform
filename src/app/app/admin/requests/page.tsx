import type { Metadata } from "next";
import Link from "next/link";
import { FilterLinks } from "@/components/app/filter-links";
import { RequestStatusBadge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RowLink, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatBudget, formatCents, formatDate, formatDateRange } from "@/lib/labels";
import { requireAdmin } from "@/server/auth/session";
import { listAllRequests, type AdminRequestFilter } from "@/server/data/requests";

export const metadata: Metadata = { title: "Service requests" };

const FILTERS: AdminRequestFilter[] = ["unquoted", "open", "awarded", "closed", "all"];

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const admin = await requireAdmin();
  const requested = (await searchParams).show;
  const show = FILTERS.find((f) => f === requested) ?? "unquoted";
  const requests = await listAllRequests(admin.id, show);

  return (
    <>
      <PageHeader
        title="Service requests"
        description={
          show === "unquoted"
            ? "Open three days or more without a live quote. Invite contractors from the customer's side or contact them directly."
            : undefined
        }
      />
      <FilterLinks
        basePath="/app/admin/requests"
        param="show"
        current={show === "unquoted" ? undefined : show}
        options={[
          { value: undefined, label: "No quotes after 3 days" },
          { value: "open", label: "Taking quotes" },
          { value: "awarded", label: "Awarded" },
          { value: "closed", label: "Completed and cancelled" },
          { value: "all", label: "All" },
        ]}
      />
      <Card>
        {requests.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No requests match this filter" />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/app/admin/requests/${r.id}`} className="block px-4 py-3.5 active:bg-subtle">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-medium text-ink">{r.title}</p>
                      <RequestStatusBadge status={r.status} />
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {r.customer_name} · {r.category_name} · {r.area_name}
                    </p>
                    <p className="tabular mt-1 text-[13px] text-ink-soft">
                      {r.quote_count} {r.quote_count === 1 ? "quote" : "quotes"} · posted {formatDate(r.created_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table label="Service requests">
                <THead>
                  <Th>Request</Th>
                  <Th>Customer</Th>
                  <Th>Dates</Th>
                  <Th>Budget</Th>
                  <Th align="right">Quotes</Th>
                  <Th align="right">Lowest</Th>
                  <Th>Posted</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {requests.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <RowLink href={`/app/admin/requests/${r.id}`}>{r.title}</RowLink>
                        <p className="text-[13px] text-muted">
                          {r.category_name} · {r.area_name}
                        </p>
                      </Td>
                      <Td className="text-ink-soft">{r.customer_name}</Td>
                      <Td className="whitespace-nowrap text-ink">{formatDateRange(r.preferred_start, r.preferred_end)}</Td>
                      <Td className="tabular whitespace-nowrap text-ink-soft">
                        {formatBudget(r.budget_min_cents, r.budget_max_cents) ?? <span className="text-faint">—</span>}
                      </Td>
                      <Td align="right" className="tabular">
                        {r.quote_count}
                      </Td>
                      <Td align="right" className="tabular whitespace-nowrap">
                        {r.lowest_quote_cents != null ? formatCents(r.lowest_quote_cents) : <span className="text-faint">—</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-ink-soft">{formatDate(r.created_at)}</Td>
                      <Td>
                        <RequestStatusBadge status={r.status} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
