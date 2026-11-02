import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { formatCents, formatDate } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { Invoice, InvoiceRow, InvoiceStatus, PaymentMethod, WorkInvoice } from "@/server/data/invoices";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  check: "Check",
  ach: "ACH bank transfer",
  wire: "Wire transfer",
  card: "Card (outside QuickPro)",
  cash: "Cash",
  other: "Other",
};

const money = (cents: string | number) => formatCents(Number(cents));

export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  if (status === "issued" && overdue)
    return (
      <Badge tone="bad" dot>
        Overdue
      </Badge>
    );
  return status === "draft" ? (
    <Badge tone="neutral">Draft</Badge>
  ) : status === "issued" ? (
    <Badge tone="info" dot>
      Awaiting payment
    </Badge>
  ) : status === "paid" ? (
    <Badge tone="ok">Paid</Badge>
  ) : (
    <Badge tone="neutral">Void</Badge>
  );
}

/** The invoice itself, laid out like a paper invoice; it is what prints. */
export function InvoiceDocument({ invoice: i }: { invoice: Invoice }) {
  return (
    <article id="invoice-document" className="rounded-lg border border-line bg-surface px-5 py-6 sm:px-8 sm:py-8" data-testid="invoice-document">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-ink">{i.issuer_name}</p>
          {i.issuer_legal_name && i.issuer_legal_name !== i.issuer_name ? (
            <p className="text-[13px] text-ink-soft">{i.issuer_legal_name}</p>
          ) : null}
          <p className="text-[13px] text-muted">
            {[i.issuer_address, i.issuer_phone, i.issuer_email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-2xl font-semibold tracking-tight text-ink">Invoice</p>
          <p className="tabular text-sm text-ink-soft">{i.number ?? "Draft, not numbered yet"}</p>
        </div>
      </header>

      <div className="mt-6 grid gap-5 border-t border-line pt-5 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-faint uppercase">Bill to</p>
          <p className="mt-1 font-medium text-ink">{i.recipient_legal_name || i.recipient_name}</p>
          <p className="text-[13px] text-muted">{[i.recipient_address, i.recipient_email].filter(Boolean).join(" · ")}</p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-faint uppercase">For</p>
          <p className="mt-1 text-ink">
            {i.context === "subcontract" ? "Subcontract on " : ""}
            {i.title}
          </p>
          <p className="text-[13px] text-muted">{i.area_name}, NY</p>
        </div>
        <dl className="tabular space-y-1 sm:text-right">
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-xs font-medium tracking-wide text-faint uppercase">Issued</dt>
            <dd className="text-ink">{i.issue_date ? formatDate(i.issue_date) : "Not yet"}</dd>
          </div>
          <div className="flex justify-between gap-3 sm:block">
            <dt className="text-xs font-medium tracking-wide text-faint uppercase">Due</dt>
            <dd className={i.overdue ? "font-medium text-bad" : "text-ink"}>{formatDate(i.due_date)}</dd>
          </div>
        </dl>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs font-medium tracking-wide text-faint uppercase">
            <th className="py-2 pr-3 font-medium">Description</th>
            <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Qty</th>
            <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Unit price</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {i.lines.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-muted">
                No lines yet.
              </td>
            </tr>
          ) : (
            i.lines.map((l, n) => (
              <tr key={n} className="align-top">
                <td className="py-2.5 pr-3 whitespace-pre-line text-ink">
                  {l.description}
                  <span className="tabular block text-[13px] text-muted sm:hidden">
                    {Number(l.quantity)} × {money(l.unit_cents)}
                  </span>
                </td>
                <td className="tabular hidden py-2.5 pr-3 text-right text-ink-soft sm:table-cell">{Number(l.quantity)}</td>
                <td className="tabular hidden py-2.5 pr-3 text-right text-ink-soft sm:table-cell">{money(l.unit_cents)}</td>
                <td className="tabular py-2.5 text-right text-ink">{money(l.amount_cents)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <dl className="tabular mt-4 ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between gap-6">
          <dt className="text-muted">Subtotal</dt>
          <dd>{money(i.subtotal_cents)}</dd>
        </div>
        {i.tax_rate_mpct > 0 ? (
          <div className="flex justify-between gap-6">
            <dt className="text-muted">Sales tax ({i.tax_rate_mpct / 1000}%)</dt>
            <dd>{money(i.tax_cents)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-6 border-t border-line-strong pt-1.5 text-base font-semibold text-ink">
          <dt>Total</dt>
          <dd data-testid="invoice-total">{money(i.total_cents)}</dd>
        </div>
        {i.status === "paid" ? (
          <div className="flex justify-between gap-6 text-ok">
            <dt>Paid {formatDate(i.paid_on)}</dt>
            <dd>{money(i.total_cents)}</dd>
          </div>
        ) : null}
      </dl>

      {i.payment_instructions || i.notes ? (
        <div className="mt-6 grid gap-5 border-t border-line pt-5 text-sm sm:grid-cols-2">
          {i.payment_instructions ? (
            <div>
              <p className="text-xs font-medium tracking-wide text-faint uppercase">How to pay</p>
              <p className="mt-1 whitespace-pre-line text-ink-soft">{i.payment_instructions}</p>
            </div>
          ) : null}
          {i.notes ? (
            <div>
              <p className="text-xs font-medium tracking-wide text-faint uppercase">Notes</p>
              <p className="mt-1 whitespace-pre-line text-ink-soft">{i.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="mt-6 text-xs text-faint">
        Sent through QuickPro. Payment goes directly to {i.issuer_name}; QuickPro doesn&apos;t collect or hold payments.
      </p>
    </article>
  );
}

/** A list of invoices for a business or staff; `viewerOrgId` marks sent versus received. */
export function InvoiceList({
  invoices,
  href,
  viewerOrgId,
  emptyText,
}: {
  invoices: InvoiceRow[];
  href: (i: InvoiceRow) => string;
  viewerOrgId?: string;
  emptyText: string;
}) {
  if (!invoices.length) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No invoices">{emptyText}</EmptyState>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-line">
        {invoices.map((i) => {
          const sent = viewerOrgId ? i.issuer_org_id === viewerOrgId : undefined;
          const other = sent === undefined ? `${i.issuer_name} → ${i.recipient_name}` : sent ? `To ${i.recipient_name}` : `From ${i.issuer_name}`;
          return (
            <li key={i.id}>
              <Link href={href(i)} className="flex items-start justify-between gap-4 px-4 py-3.5 hover:bg-subtle/60 sm:px-5" data-testid="invoice-row">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    {i.number ?? "Draft"} <span className="font-normal text-muted">· {other}</span>
                  </span>
                  <span className="block truncate text-[13px] text-ink-soft">
                    {i.context === "subcontract" ? "Subcontract: " : ""}
                    {i.title}
                  </span>
                  <span className="block text-[13px] text-muted">
                    {i.status === "paid"
                      ? `Paid ${formatDate(i.paid_on)}`
                      : i.status === "issued"
                        ? `Due ${formatDate(i.due_date)}`
                        : i.status === "draft"
                          ? `Started ${formatDate(i.created_at)}`
                          : "Voided"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="tabular font-medium text-ink">{money(i.total_cents)}</span>
                  <InvoiceStatusBadge status={i.status} overdue={i.overdue} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * Invoices on one project or subcontract: the business doing the work starts
 * one here; the business paying sees what it has been sent.
 */
export function WorkInvoices({
  invoices,
  href,
  createAction,
  payer,
  issuerName,
}: {
  invoices: WorkInvoice[];
  href: (id: string) => string;
  /** Present when the viewer's business does the work and the viewer can dispatch. */
  createAction?: Action;
  /** The viewer's business pays these invoices. */
  payer: boolean;
  issuerName: string;
}) {
  if (!invoices.length && !createAction) return null;
  const outstanding = invoices.filter((i) => i.status === "issued").reduce((s, i) => s + Number(i.total_cents), 0);
  return (
    <Card>
      <CardHeader
        title="Invoices"
        description={
          payer
            ? `From ${issuerName}. Pay them directly as you agreed; QuickPro doesn't process payments yet.`
            : "Bill for this work. Payment goes directly to you; you mark each invoice paid when it arrives."
        }
        action={
          outstanding > 0 ? <span className="tabular text-[13px] text-muted">{money(outstanding)} outstanding</span> : undefined
        }
      />
      {invoices.length ? (
        <ul className="divide-y divide-line">
          {invoices.map((i) => (
            <li key={i.id}>
              <Link href={href(i.id)} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-subtle/60 sm:px-5" data-testid="work-invoice">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{i.number ?? "Draft"}</span>
                  <span className="block text-[13px] text-muted">
                    {i.status === "paid" ? `Paid ${formatDate(i.paid_on)}` : i.due_date ? `Due ${formatDate(i.due_date)}` : null}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular text-sm text-ink">{money(i.total_cents)}</span>
                  <InvoiceStatusBadge status={i.status} overdue={i.overdue} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {createAction ? (
        <CardBody className={invoices.length ? "border-t border-line" : ""}>
          <ActionForm action={createAction} successMessage={false}>
            <SubmitButton variant="secondary" pendingLabel="Starting…">
              {invoices.length ? "Start another invoice" : "Create an invoice"}
            </SubmitButton>
          </ActionForm>
        </CardBody>
      ) : null}
    </Card>
  );
}
