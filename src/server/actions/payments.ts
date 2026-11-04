"use server";

// Card payments through Stripe (D-040). The database decides who may set up
// payouts or pay an invoice; these re-check the user and map errors.

import { redirect } from "next/navigation";
import { requireOrgManager } from "@/server/actions/guards";
import { requireUser } from "@/server/auth/session";
import { toUserMessage, UserFacingError } from "@/server/errors";
import { startCardPayment, startPayoutSetup } from "@/server/payments";
import { uuid, type FormState } from "@/lib/schemas";

/** Sends an owner or admin to Stripe's hosted onboarding. */
export async function setUpPayoutsAction(orgId: string): Promise<FormState> {
  let url: string;
  try {
    const { user, org } = await requireOrgManager(orgId);
    if (org.kind !== "contractor") throw new UserFacingError("Card payments are for contractors.");
    url = await startPayoutSetup(user.id, org.id, org.name, user.email);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  redirect(url);
}

/** Sends the payer's dispatcher to Stripe Checkout for an issued invoice. */
export async function payInvoiceByCardAction(
  orgId: string,
  invoiceId: string,
): Promise<FormState> {
  let url: string;
  try {
    const user = await requireUser();
    if (!uuid.safeParse(orgId).success || !uuid.safeParse(invoiceId).success) throw new UserFacingError("Invoice not found.");
    url = await startCardPayment(user.id, orgId, invoiceId);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  redirect(url);
}
