"use server";

// Invoices between businesses. The database decides who may do what and
// works out every total; these re-check the user, validate input and map errors.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import {
  createInvoice,
  issueInvoice,
  recordInvoicePayment,
  saveInvoiceDraft,
  voidInvoice,
  type InvoiceContext,
} from "@/server/data/invoices";
import { toUserMessage, UserFacingError } from "@/server/errors";
import {
  fieldErrorsOf,
  formObject,
  invoiceDraftSchema,
  invoiceLinesFrom,
  invoicePaymentSchema,
  invoiceVoidSchema,
  uuid,
  type FormState,
} from "@/lib/schemas";

function ids(...values: unknown[]): void {
  if (values.some((v) => !uuid.safeParse(v).success)) throw new UserFacingError("Invoice not found.");
}

function refresh(): void {
  revalidatePath("/app", "layout");
}

/** Starts a draft for a project or subcontract and opens it. */
export async function createInvoiceAction(
  orgId: string,
  context: InvoiceContext,
  targetId: string,
  // The form only carries the button; the bound arguments say what to invoice.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _state: FormState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<FormState> {
  let id: string;
  try {
    const user = await requireUser();
    ids(orgId, targetId);
    if (context !== "project" && context !== "subcontract") throw new UserFacingError("Not found.");
    id = await createInvoice(user.id, context, targetId);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  redirect(`/app/org/${orgId}/invoices/${id}`);
}

/** Saves a draft; with intent "issue" also issues it. */
export async function saveInvoiceAction(orgId: string, invoiceId: string, _: FormState, formData: FormData): Promise<FormState> {
  let issued = false;
  try {
    const user = await requireUser();
    ids(orgId, invoiceId);
    const parsed = invoiceDraftSchema.safeParse({ ...formObject(formData), lines: invoiceLinesFrom(formData) });
    if (!parsed.success) {
      const fieldErrors = fieldErrorsOf(parsed.error);
      return { ok: false, fieldErrors, message: fieldErrors.lines?.[0] ? `Lines: ${fieldErrors.lines[0]}` : undefined };
    }
    await saveInvoiceDraft(user.id, invoiceId, {
      dueDate: parsed.data.dueDate,
      notes: parsed.data.notes,
      paymentInstructions: parsed.data.paymentInstructions,
      taxRateMpct: parsed.data.taxRate,
      lines: parsed.data.lines,
    });
    if (formData.get("intent") === "issue") {
      await issueInvoice(user.id, invoiceId);
      issued = true;
    }
  } catch (error) {
    refresh();
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  if (issued) redirect(`/app/org/${orgId}/invoices/${invoiceId}?issued=1`);
  return { ok: true, message: "Draft saved. Only your team can see it until you issue it." };
}

export async function recordPaymentAction(orgId: string, invoiceId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    ids(orgId, invoiceId);
    const parsed = invoicePaymentSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await recordInvoicePayment(user.id, invoiceId, parsed.data.paidOn, parsed.data.method, parsed.data.reference);
    refresh();
    return { ok: true, message: "Marked paid. The business you billed was notified." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function voidInvoiceAction(orgId: string, invoiceId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    ids(orgId, invoiceId);
    const parsed = invoiceVoidSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await voidInvoice(user.id, invoiceId, parsed.data.reason);
    refresh();
    return { ok: true, message: "Invoice voided." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
