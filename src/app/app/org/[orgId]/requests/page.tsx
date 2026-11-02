import type { Metadata } from "next";
import Link from "next/link";
import { FilterLinks } from "@/components/app/filter-links";
import { Badge, QuoteStatusBadge, RequestStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { RowLink, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatBudget, formatCents, formatDateRange } from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";
import { canDispatch, getInsuranceStatus, type OrganizationWithRole } from "@/server/data/organizations";
import {
  listContractorRequests,
  listCustomerRequests,
  type ContractorRequestFilter,
  type CustomerRequestFilter,
} from "@/server/data/requests";
import type { CurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Requests" };

export default async function RequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  const show = (await searchParams).show;
  return org.kind === "customer" ? (
    <CustomerRequests user={user} org={org} show={show} />
  ) : (
    <ContractorRequests user={user} org={org} show={show} />
  );
}

async function CustomerRequests({ user, org, show }: { user: CurrentUser; org: OrganizationWithRole; show?: string }) {
  const filter: CustomerRequestFilter = show === "closed" || show === "all" ? show : "active";
  const requests = await listCustomerRequests(user.id, org.id, filter);
  const canPost = canDispatch(org.my_role) && org.status === "approved";
  const base = `/app/org/${org.id}/requests`;

  return (
    <div className="space-y-4">
      {org.status !== "approved" ? (
        <FormMessage tone="info">You can request service once QuickPro staff approve your organization.</FormMessage>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FilterLinks
          basePath={base}
          param="show"
          current={filter === "active" ? undefined : filter}
          options={[
            { value: undefined, label: "Active" },
            { value: "closed", label: "Completed and cancelled" },
            { value: "all", label: "All" },
          ]}
        />
        {canPost ? <LinkButton href={`${base}/new`}>Request service</LinkButton> : null}
      </div>
      <Card>
        {requests.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState title={filter === "active" ? "No active requests" : "Nothing here yet"}>
              {canPost && filter === "active"
                ? "Describe the work and approved contractors who serve your town can send you quotes."
                : null}
            </EmptyState>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`${base}/${r.id}`} className="block px-4 py-3.5 active:bg-subtle" data-testid="request-row">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-medium text-ink">{r.title}</p>
                      <RequestStatusBadge status={r.status} workReported={!!r.work_completed_at} />
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {r.category_name} · {r.area_name} · {formatDateRange(r.preferred_start, r.preferred_end)}
                    </p>
                    <p className="tabular mt-1.5 text-[13px] text-ink-soft">
                      {r.quote_count === 0 ? "No quotes yet" : `${r.quote_count} ${r.quote_count === 1 ? "quote" : "quotes"} · from ${formatCents(r.lowest_quote_cents)}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table label="Service requests">
                <THead>
                  <Th>Request</Th>
                  <Th>Preferred dates</Th>
                  <Th>Budget</Th>
                  <Th align="right">Quotes</Th>
                  <Th align="right">Lowest</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {requests.map((r) => (
                    <Tr key={r.id} testId="request-row">
                      <Td>
                        <RowLink href={`${base}/${r.id}`}>{r.title}</RowLink>
                        <p className="text-[13px] text-muted">
                          {r.category_name} · {r.area_name}
                        </p>
                      </Td>
                      <Td className="whitespace-nowrap text-ink">{formatDateRange(r.preferred_start, r.preferred_end)}</Td>
                      <Td className="tabular whitespace-nowrap text-ink-soft">
                        {formatBudget(r.budget_min_cents, r.budget_max_cents) ?? <span className="text-faint">Not given</span>}
                      </Td>
                      <Td align="right" className="tabular text-ink">
                        {r.quote_count}
                      </Td>
                      <Td align="right" className="tabular whitespace-nowrap text-ink">
                        {r.lowest_quote_cents != null ? formatCents(r.lowest_quote_cents) : <span className="text-faint">—</span>}
                      </Td>
                      <Td>
                        <RequestStatusBadge status={r.status} workReported={!!r.work_completed_at} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

async function ContractorRequests({ user, org, show }: { user: CurrentUser; org: OrganizationWithRole; show?: string }) {
  const filter: ContractorRequestFilter = show === "quoted" || show === "awarded" ? show : "open";
  const [requests, insurance] = await Promise.all([
    org.status === "approved" ? listContractorRequests(user.id, org.id, filter) : Promise.resolve([]),
    getInsuranceStatus(user.id, org.id),
  ]);
  const base = `/app/org/${org.id}/requests`;

  return (
    <div className="space-y-4">
      {org.status !== "approved" ? (
        <FormMessage tone="info">
          Customer requests appear here once QuickPro staff approve your business.
        </FormMessage>
      ) : insurance !== "current" ? (
        <FormMessage tone="bad">
          Quoting needs a current general liability certificate reviewed by QuickPro staff. Upload your renewal on the
          Documents tab.
        </FormMessage>
      ) : null}
      <FilterLinks
        basePath={base}
        param="show"
        current={filter === "open" ? undefined : filter}
        options={[
          { value: undefined, label: "To quote" },
          { value: "quoted", label: "Quoted" },
          { value: "awarded", label: "Won" },
        ]}
      />
      <Card>
        {requests.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState title={filter === "open" ? "No open requests for you right now" : filter === "quoted" ? "No quotes yet" : "No awarded work yet"}>
              {filter === "open" ? (
                <>
                  Requests show up when a customer asks for a{" "}
                  <Link href={`/app/org/${org.id}/services`} className="text-brand hover:underline">
                    service and town you list
                  </Link>
                  , or invites you to quote.
                </>
              ) : null}
            </EmptyState>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`${base}/${r.id}`} className="block px-4 py-3.5 active:bg-subtle" data-testid="request-row">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-medium text-ink">{r.title}</p>
                      {r.my_quote_status && filter !== "open" ? <QuoteStatusBadge status={r.my_quote_status} /> : r.invited ? <Badge tone="info">Invited</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {r.customer_name} · {r.area_name}
                    </p>
                    <p className="tabular mt-1.5 text-[13px] text-ink-soft">
                      {formatDateRange(r.preferred_start, r.preferred_end)}
                      {filter !== "open" && r.my_quote_cents != null ? ` · Your quote ${formatCents(r.my_quote_cents)}` : ""}
                      {filter === "open" && formatBudget(r.budget_min_cents, r.budget_max_cents)
                        ? ` · Budget ${formatBudget(r.budget_min_cents, r.budget_max_cents)}`
                        : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table label="Requests">
                <THead>
                  <Th>Request</Th>
                  <Th>Customer</Th>
                  <Th>Preferred dates</Th>
                  {filter === "open" ? <Th>Budget</Th> : <Th align="right">Your quote</Th>}
                  <Th>{filter === "open" ? "" : "Status"}</Th>
                </THead>
                <TBody>
                  {requests.map((r) => (
                    <Tr key={r.id} testId="request-row">
                      <Td>
                        <RowLink href={`${base}/${r.id}`}>{r.title}</RowLink>
                        <p className="text-[13px] text-muted">
                          {r.category_name} · {r.area_name}
                        </p>
                      </Td>
                      <Td className="text-ink-soft">{r.customer_name}</Td>
                      <Td className="whitespace-nowrap text-ink">{formatDateRange(r.preferred_start, r.preferred_end)}</Td>
                      {filter === "open" ? (
                        <Td className="tabular whitespace-nowrap text-ink-soft">
                          {formatBudget(r.budget_min_cents, r.budget_max_cents) ?? <span className="text-faint">Not given</span>}
                        </Td>
                      ) : (
                        <Td align="right" className="tabular whitespace-nowrap text-ink">
                          {formatCents(r.my_quote_cents)}
                        </Td>
                      )}
                      <Td>
                        {filter === "open" ? (
                          r.invited ? <Badge tone="info">Invited</Badge> : null
                        ) : r.my_quote_status ? (
                          <QuoteStatusBadge status={r.my_quote_status} />
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
