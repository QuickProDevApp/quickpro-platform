import "server-only";
import { withUser } from "@/server/db/client";
import type { WorkContext } from "@/server/data/reviews";

// Invoices between businesses for agreed work (D-029). The database works out
// totals, numbers invoices, and decides who sees what; QuickPro records
// payments made outside it and moves no money.

export type InvoiceStatus = "draft" | "issued" | "paid" | "void";
export type PaymentMethod = "check" | "ach" | "wire" | "card" | "cash" | "other";
export type InvoiceContext = Extract<WorkContext, "project" | "subcontract">;

export type InvoiceRow = {
  id: string;
  context: InvoiceContext;
  request_id: string;
  subcontract_id: string | null;
  title: string;
  issuer_org_id: string;
  issuer_name: string;
  recipient_org_id: string;
  recipient_name: string;
  number: string | null;
  status: InvoiceStatus;
  overdue: boolean;
  issue_date: string | null;
  due_date: string | null;
  subtotal_cents: string;
  tax_cents: string;
  total_cents: string;
  paid_on: string | null;
  created_at: Date;
};

export type InvoiceLine = { description: string; quantity: number; unit_cents: number; amount_cents: number };

export type Invoice = {
  id: string;
  context: InvoiceContext;
  request_id: string;
  subcontract_id: string | null;
  title: string;
  area_name: string;
  issuer_org_id: string;
  issuer_name: string;
  issuer_legal_name: string | null;
  issuer_address: string;
  issuer_phone: string | null;
  issuer_email: string | null;
  recipient_org_id: string;
  recipient_name: string;
  recipient_legal_name: string | null;
  recipient_address: string;
  recipient_email: string | null;
  number: string | null;
  status: InvoiceStatus;
  overdue: boolean;
  issue_date: string | null;
  due_date: string | null;
  lines: InvoiceLine[];
  tax_rate_mpct: number;
  subtotal_cents: string;
  tax_cents: string;
  total_cents: string;
  notes: string;
  payment_instructions: string;
  paid_on: string | null;
  payment_method: PaymentMethod | null;
  payment_reference: string;
  voided_at: Date | null;
  void_reason: string | null;
  created_at: Date;
  issued_at: Date | null;
  viewer_side: "issuer" | "recipient" | "staff";
};

export type WorkInvoice = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  overdue: boolean;
  issue_date: string | null;
  due_date: string | null;
  total_cents: string;
  paid_on: string | null;
  created_at: Date;
  viewer_side: "issuer" | "recipient" | "staff";
};

// Calendar dates come back as plain "YYYY-MM-DD" strings, never instants, so
// they format as the same day everywhere.
const DATE_FIELDS = ["issue_date", "due_date", "paid_on"] as const;
function calendarDates<T extends object>(rows: T[]): T[] {
  for (const row of rows as Record<string, unknown>[]) {
    for (const key of DATE_FIELDS) {
      const v = row[key];
      if (v instanceof Date) row[key] = v.toISOString().slice(0, 10);
    }
  }
  return rows;
}

export async function listOrgInvoices(userId: string, orgId: string) {
  return calendarDates(await withUser(userId, (tx) => tx<InvoiceRow[]>`select * from public.org_invoices(${orgId})`));
}

export async function listAdminInvoices(userId: string, status: InvoiceStatus | null) {
  return calendarDates(
    await withUser(userId, (tx) => tx<InvoiceRow[]>`select * from public.admin_invoices(${status}::public.invoice_status)`),
  );
}

export async function getInvoice(userId: string, invoiceId: string): Promise<Invoice | null> {
  try {
    const [row] = calendarDates(await withUser(userId, (tx) => tx<Invoice[]>`select * from public.get_invoice(${invoiceId})`));
    return row ?? null;
  } catch (error) {
    if ((error as { code?: string }).code === "P0002") return null;
    throw error;
  }
}

export async function listWorkInvoices(userId: string, context: InvoiceContext, targetId: string) {
  return calendarDates(
    await withUser(userId, (tx) => tx<WorkInvoice[]>`
      select * from public.work_invoices(${context}::public.work_context, ${targetId})
    `),
  );
}

export function createInvoice(userId: string, context: InvoiceContext, targetId: string) {
  return withUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      select public.create_invoice(${context}::public.work_context, ${targetId}) as id
    `;
    return id;
  });
}

export type InvoiceDraftInput = {
  dueDate: string;
  notes: string;
  paymentInstructions: string;
  taxRateMpct: number;
  lines: { description: string; quantity: number; unit_cents: number }[];
};

export function saveInvoiceDraft(userId: string, invoiceId: string, input: InvoiceDraftInput) {
  return withUser(userId, (tx) => tx`
    select public.save_invoice_draft(${invoiceId}, ${input.dueDate}::date, ${input.notes}, ${input.paymentInstructions},
                                     ${input.taxRateMpct}, ${tx.json(input.lines)})
  `);
}

export function issueInvoice(userId: string, invoiceId: string) {
  return withUser(userId, (tx) => tx`select public.issue_invoice(${invoiceId})`);
}

export function recordInvoicePayment(userId: string, invoiceId: string, paidOn: string, method: PaymentMethod, reference: string) {
  return withUser(userId, (tx) => tx`
    select public.record_invoice_payment(${invoiceId}, ${paidOn}::date, ${method}::public.payment_method, ${reference})
  `);
}

export function voidInvoice(userId: string, invoiceId: string, reason: string) {
  return withUser(userId, (tx) => tx`select public.void_invoice(${invoiceId}, ${reason})`);
}
