import type { Metadata } from "next";
import { FilterLinks } from "@/components/app/filter-links";
import { InvoiceList } from "@/components/app/invoices";
import { Card, CardBody } from "@/components/ui/card";
import { formatCents } from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";
import { listOrgInvoices, type InvoiceRow } from "@/server/data/invoices";

export const metadata: Metadata = { title: "Invoices" };

const sum = (rows: InvoiceRow[]) => rows.reduce((s, i) => s + Number(i.total_cents), 0);

export default async function OrganizationInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  const all = await listOrgInvoices(user.id, org.id);
  const sent = all.filter((i) => i.issuer_org_id === org.id);
  const received = all.filter((i) => i.recipient_org_id === org.id);
  // Contractors both send (to customers and primes) and receive (from subcontractors).
  const contractor = org.kind === "contractor";
  const requested = (await searchParams).show;
  const show = !contractor ? "received" : requested === "received" ? "received" : "sent";
  const toCollect = sent.filter((i) => i.status === "issued");
  const toPay = received.filter((i) => i.status === "issued");
  const overdue = (contractor ? toCollect : toPay).filter((i) => i.overdue);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {contractor ? (
          <Stat label="To collect" value={formatCents(sum(toCollect))} note={`${toCollect.length} unpaid ${toCollect.length === 1 ? "invoice" : "invoices"}`} />
        ) : null}
        <Stat label="To pay" value={formatCents(sum(toPay))} note={`${toPay.length} unpaid ${toPay.length === 1 ? "invoice" : "invoices"}`} />
        <Stat
          label={contractor ? "Overdue to collect" : "Overdue"}
          value={formatCents(sum(overdue))}
          note={overdue.length ? `${overdue.length} past the due date` : "Nothing overdue"}
          tone={overdue.length ? "bad" : undefined}
        />
      </div>
      {contractor ? (
        <FilterLinks
          basePath={`/app/org/${org.id}/invoices`}
          param="show"
          current={show === "sent" ? undefined : show}
          options={[
            { value: undefined, label: `Sent (${sent.length})` },
            { value: "received", label: `Received (${received.length})` },
          ]}
        />
      ) : null}
      <InvoiceList
        invoices={show === "sent" ? sent : received}
        href={(i) => `/app/org/${org.id}/invoices/${i.id}`}
        viewerOrgId={org.id}
        emptyText={
          show === "sent"
            ? "Create an invoice from a project you were awarded, or a subcontract you accepted."
            : contractor
              ? "Invoices from your subcontractors appear here."
              : "Invoices from contractors you hired appear here."
        }
      />
      <p className="text-[13px] text-muted">
        QuickPro doesn&apos;t collect or hold payments yet. Invoices are paid directly between businesses, and the business
        that sent one marks it paid.
      </p>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "bad" }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-medium tracking-wide text-faint uppercase">{label}</p>
        <p className={`tabular mt-1 text-xl font-semibold ${tone === "bad" ? "text-bad" : "text-ink"}`}>{value}</p>
        <p className="text-[13px] text-muted">{note}</p>
      </CardBody>
    </Card>
  );
}
