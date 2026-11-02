import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument, InvoiceStatusBadge, PAYMENT_METHOD_LABEL } from "@/components/app/invoices";
import { PrintButton } from "@/components/app/print-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { requireAdmin } from "@/server/auth/session";
import { getInvoice } from "@/server/data/invoices";

export const metadata: Metadata = { title: "Invoice" };

export default async function AdminInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const admin = await requireAdmin();
  if (!uuid.safeParse(invoiceId).success) notFound();
  const invoice = await getInvoice(admin.id, invoiceId);
  if (!invoice || invoice.status === "draft") notFound();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/admin/invoices" className="text-sm text-muted hover:text-ink">
          ← Invoices
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">
            {invoice.number} · {invoice.issuer_name} → {invoice.recipient_name}
          </h2>
          <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
        </div>
        <Link href={`/app/admin/requests/${invoice.request_id}`} className="text-sm text-muted hover:text-ink hover:underline">
          {invoice.context === "subcontract" ? "Subcontract on " : "Project: "}
          {invoice.title}
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <InvoiceDocument invoice={invoice} />
        <div className="space-y-6">
          <PrintButton />
          <Card>
            <CardHeader title="Record" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                <Row label="Issued">{formatDateTime(invoice.issued_at)}</Row>
                <Row label="Due">{formatDate(invoice.due_date)}</Row>
                {invoice.status === "paid" ? (
                  <Row label="Paid">
                    {formatDate(invoice.paid_on)}
                    {invoice.payment_method ? ` · ${PAYMENT_METHOD_LABEL[invoice.payment_method]}` : ""}
                    {invoice.payment_reference ? ` · ${invoice.payment_reference}` : ""}
                  </Row>
                ) : null}
                {invoice.status === "void" ? <Row label="Voided">{`${formatDateTime(invoice.voided_at)} · ${invoice.void_reason}`}</Row> : null}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
