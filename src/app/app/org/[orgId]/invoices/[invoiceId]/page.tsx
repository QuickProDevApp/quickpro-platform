import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceEditor } from "@/components/app/invoice-editor";
import { InvoiceDocument, InvoiceStatusBadge, PAYMENT_METHOD_LABEL } from "@/components/app/invoices";
import { PrintButton } from "@/components/app/print-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatCents, formatDate, formatDateTime } from "@/lib/labels";
import { PAYMENT_METHODS, uuid } from "@/lib/schemas";
import { requireMembership } from "@/server/actions/guards";
import { recordPaymentAction, saveInvoiceAction, voidInvoiceAction } from "@/server/actions/invoices";
import { getInvoice } from "@/server/data/invoices";
import { canDispatch } from "@/server/data/organizations";

export const metadata: Metadata = { title: "Invoice" };

export default async function OrganizationInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; invoiceId: string }>;
  searchParams: Promise<{ issued?: string }>;
}) {
  const { orgId, invoiceId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (!uuid.safeParse(invoiceId).success) notFound();
  const invoice = await getInvoice(user.id, invoiceId);
  if (!invoice || (invoice.issuer_org_id !== org.id && invoice.recipient_org_id !== org.id)) notFound();
  const issuer = invoice.issuer_org_id === org.id;
  const dispatcher = canDispatch(org.my_role);
  const justIssued = (await searchParams).issued === "1" && invoice.status === "issued";
  const workHref =
    invoice.context === "subcontract" && !issuer
      ? `/app/org/${org.id}/requests/${invoice.request_id}/subcontracts/${invoice.subcontract_id}`
      : `/app/org/${org.id}/requests/${invoice.request_id}`;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/app/org/${org.id}/invoices${issuer || org.kind === "customer" ? "" : "?show=received"}`} className="text-sm text-muted hover:text-ink">
          ← Invoices
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">
            {invoice.number ?? "Draft invoice"} · {formatCents(Number(invoice.total_cents))}
          </h2>
          <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
        </div>
        <p className="text-sm text-muted">
          {issuer ? `To ${invoice.recipient_name}` : `From ${invoice.issuer_name}`} ·{" "}
          <Link href={workHref} className="hover:text-ink hover:underline">
            {invoice.context === "subcontract" ? "Subcontract: " : ""}
            {invoice.title}
          </Link>
        </p>
      </div>

      {justIssued ? (
        <FormMessage tone="ok">
          Invoice {invoice.number} issued. {invoice.recipient_name} got a QuickPro notification and can open it now. Email
          delivery isn&apos;t available yet, so you can also print it or save it as a PDF to send.
        </FormMessage>
      ) : null}
      {invoice.status === "void" ? (
        <FormMessage tone="info">
          Voided {formatDateTime(invoice.voided_at)}
          {invoice.void_reason ? `: “${invoice.void_reason}”` : "."} Nothing is owed on this invoice.
        </FormMessage>
      ) : null}

      {invoice.status === "draft" && issuer ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,28rem)]">
          <Card>
            <CardHeader title="Edit draft" description={`Only your team sees a draft. ${invoice.recipient_name} sees it once you issue it.`} />
            <CardBody>
              {dispatcher ? (
                <InvoiceEditor
                  action={saveInvoiceAction.bind(null, org.id, invoice.id)}
                  initial={{
                    dueDate: invoice.due_date ?? "",
                    taxRate: invoice.tax_rate_mpct ? String(invoice.tax_rate_mpct / 1000) : "",
                    notes: invoice.notes,
                    paymentInstructions: invoice.payment_instructions,
                    lines: invoice.lines,
                  }}
                />
              ) : (
                <p className="text-sm text-muted">Owners, admins and dispatchers on your team edit and issue invoices.</p>
              )}
            </CardBody>
          </Card>
          <div className="space-y-3">
            <p className="text-xs font-medium tracking-wide text-faint uppercase">Last saved</p>
            <InvoiceDocument invoice={invoice} />
            {dispatcher ? <VoidForm action={voidInvoiceAction.bind(null, org.id, invoice.id)} draft /> : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <InvoiceDocument invoice={invoice} />
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <PrintButton />
            </div>
            {invoice.status === "paid" ? (
              <Card>
                <CardHeader title="Paid" />
                <CardBody className="space-y-1 text-sm text-ink-soft">
                  <p>
                    {formatDate(invoice.paid_on)} by {invoice.payment_method ? PAYMENT_METHOD_LABEL[invoice.payment_method] : "—"}
                  </p>
                  {invoice.payment_reference ? <p className="text-muted">Reference: {invoice.payment_reference}</p> : null}
                </CardBody>
              </Card>
            ) : null}
            {invoice.status === "issued" && !issuer ? (
              <Card>
                <CardHeader title="Paying this invoice" />
                <CardBody className="space-y-2 text-[13px] text-ink-soft">
                  <p>
                    Pay {invoice.issuer_name} directly{invoice.payment_instructions ? " as the invoice describes" : " as you agreed"}.
                    QuickPro doesn&apos;t process payments yet.
                  </p>
                  <p>{invoice.issuer_name} marks it paid when the money arrives, and you&apos;ll get a notification.</p>
                  <p>
                    If something on it is wrong, message them on the project, or{" "}
                    <Link href={workHref} className="font-medium text-brand hover:underline">
                      report a problem
                    </Link>{" "}
                    there.
                  </p>
                </CardBody>
              </Card>
            ) : null}
            {invoice.status === "issued" && issuer && dispatcher ? (
              <>
                <Card>
                  <CardHeader title="Record a payment" description="When the money arrives, mark the invoice paid." />
                  <CardBody>
                    <ActionForm action={recordPaymentAction.bind(null, org.id, invoice.id)}>
                      <Field name="paidOn" label="Date received">
                        <Input id="paidOn" name="paidOn" type="date" max={today} defaultValue={today} required />
                      </Field>
                      <Field name="method" label="How it was paid">
                        <Select id="method" name="method" defaultValue="" required>
                          <option value="" disabled>
                            Choose one
                          </option>
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {PAYMENT_METHOD_LABEL[m]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field name="reference" label="Reference" hint="Optional. Check number or transfer ID.">
                        <Input id="reference" name="reference" maxLength={200} />
                      </Field>
                      <SubmitButton pendingLabel="Saving…">Mark paid</SubmitButton>
                    </ActionForm>
                  </CardBody>
                </Card>
                <VoidForm action={voidInvoiceAction.bind(null, org.id, invoice.id)} />
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function VoidForm({
  action,
  draft = false,
}: {
  action: (state: import("@/lib/schemas").FormState, formData: FormData) => Promise<import("@/lib/schemas").FormState>;
  draft?: boolean;
}) {
  return (
    <details className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink sm:px-5">
        {draft ? "Discard this draft…" : "Void this invoice…"}
      </summary>
      <div className="border-t border-line px-4 py-4 sm:px-5">
        <ActionForm action={action} className="space-y-3">
          {draft ? (
            <p className="text-[13px] text-muted">The draft is kept as void in your list, so its history isn&apos;t lost.</p>
          ) : (
            <Field name="reason" id="void-reason" label="Why" hint="The business you billed sees this.">
              <Textarea name="reason" id="void-reason" rows={2} maxLength={1000} required />
            </Field>
          )}
          <SubmitButton variant="danger" pendingLabel="Saving…">
            {draft ? "Discard draft" : "Void invoice"}
          </SubmitButton>
        </ActionForm>
      </div>
    </details>
  );
}
