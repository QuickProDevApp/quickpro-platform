"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMembership, requireOrgDispatcher } from "@/server/actions/guards";
import {
  acceptQuote,
  cancelRequest,
  confirmCompletion,
  createRequest,
  declineQuote,
  getContractorQuote,
  getRequest,
  inviteContractor,
  listRequestQuotes,
  postProjectMessage,
  postQuoteMessage,
  reopenWork,
  reportWorkComplete,
  submitQuote,
  withdrawQuote,
} from "@/server/data/requests";
import {
  cancelSubcontract,
  completeSubcontract,
  listProjectSubcontracts,
  offerSubcontract,
  postSubcontractMessage,
  respondToSubcontract,
} from "@/server/data/subcontracts";
import { toUserMessage, UserFacingError } from "@/server/errors";
import {
  askContractorSchema,
  completionNoteSchema,
  fieldErrorsOf,
  formObject,
  messageSchema,
  quoteSchema,
  reasonSchema,
  serviceRequestSchema,
  subcontractOfferSchema,
  subcontractResponseSchema,
  uuid,
  type FormState,
} from "@/lib/schemas";

function done(orgId: string, message: string): FormState {
  revalidatePath(`/app/org/${orgId}`, "layout");
  return { ok: true, message };
}

/** The request, if it belongs to this customer organization and the user dispatches for it. */
async function requireCustomerRequest(orgId: string, requestId: unknown) {
  const { user, org } = await requireOrgDispatcher(orgId, "customer");
  const parsed = uuid.safeParse(requestId);
  const request = parsed.success ? await getRequest(user.id, parsed.data) : null;
  if (!request || request.organization_id !== org.id) throw new UserFacingError("Request not found.");
  return { user, org, request };
}

/** A quote on this customer's request. */
async function requireQuoteOnRequest(orgId: string, requestId: string, quoteId: unknown) {
  const ctx = await requireCustomerRequest(orgId, requestId);
  const parsed = uuid.safeParse(quoteId);
  const quotes = parsed.success ? await listRequestQuotes(ctx.user.id, ctx.request.id) : [];
  const quote = quotes.find((q) => q.id === parsed.data);
  if (!quote) throw new UserFacingError("Quote not found.");
  return { ...ctx, quote };
}

export async function createRequestAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  let requestId: string;
  try {
    const { user, org } = await requireOrgDispatcher(orgId, "customer");
    const parsed = serviceRequestSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    requestId = await createRequest(user.id, org.id, parsed.data);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath(`/app/org/${orgId}`, "layout");
  redirect(`/app/org/${orgId}/requests/${requestId}?posted=1`);
}

export async function inviteContractorAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, request } = await requireCustomerRequest(orgId, requestId);
    await inviteContractor(user.id, request.id, uuid.parse(formData.get("contractorId")));
    return done(orgId, "Invitation sent. They'll see the request in QuickPro.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function acceptQuoteAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, quote } = await requireQuoteOnRequest(orgId, requestId, formData.get("quoteId"));
    await acceptQuote(user.id, quote.id);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  // The quote list re-renders without the form, so the confirmation lives on the page.
  revalidatePath(`/app/org/${orgId}`, "layout");
  redirect(`/app/org/${orgId}/requests/${requestId}?awarded=1`);
}

export async function declineQuoteAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, quote } = await requireQuoteOnRequest(orgId, requestId, formData.get("quoteId"));
    await declineQuote(user.id, quote.id, String(formData.get("note") ?? "").slice(0, 1000));
    return done(orgId, "Quote declined.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function cancelRequestAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, request } = await requireCustomerRequest(orgId, requestId);
    const parsed = reasonSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await cancelRequest(user.id, request.id, parsed.data.reason);
    return done(orgId, "Request cancelled.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function confirmCompletionAction(orgId: string, requestId: string): Promise<FormState> {
  try {
    const { user, request } = await requireCustomerRequest(orgId, requestId);
    await confirmCompletion(user.id, request.id);
    return done(orgId, "Completion confirmed. The contractor was notified.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function reopenWorkAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, request } = await requireCustomerRequest(orgId, requestId);
    const parsed = reasonSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await reopenWork(user.id, request.id, parsed.data.reason);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  // The confirmation card disappears with the form, so the page says what happened.
  revalidatePath(`/app/org/${orgId}`, "layout");
  redirect(`/app/org/${orgId}/requests/${requestId}?sentback=1`);
}

/** Either business on an awarded project. The database checks that the user belongs to one of them. */
export async function postProjectMessageAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await requireMembership(orgId);
    const id = uuid.safeParse(requestId);
    if (!id.success) throw new UserFacingError("Request not found.");
    const parsed = messageSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await postProjectMessage(user.id, id.data, parsed.data.body);
    return done(orgId, "Sent.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

/**
 * A message in a contractor's thread with the customer before the award
 * (D-041). Either side's dispatchers; the database checks which side the user
 * is on and that the request is still open.
 */
export async function postQuoteQuestionAction(
  orgId: string,
  requestId: string,
  contractorId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { user } = await requireMembership(orgId);
    const ids = [uuid.safeParse(requestId), uuid.safeParse(contractorId)];
    if (!ids.every((i) => i.success)) throw new UserFacingError("Request not found.");
    const parsed = messageSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await postQuoteMessage(user.id, requestId, contractorId, parsed.data.body);
    return done(orgId, "Sent.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

/** The customer asks a contractor that quoted or was invited, starting a thread. */
export async function askContractorAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await requireOrgDispatcher(orgId, "customer");
    const id = uuid.safeParse(requestId);
    if (!id.success) throw new UserFacingError("Request not found.");
    const parsed = askContractorSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await postQuoteMessage(user.id, id.data, parsed.data.contractorId, parsed.data.body);
    return done(orgId, "Sent. They'll get a notification.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

// Contractor side --------------------------------------------------------------

export async function submitQuoteAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgDispatcher(orgId, "contractor");
    const id = uuid.safeParse(requestId);
    if (!id.success) throw new UserFacingError("Request not found.");
    const parsed = quoteSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    const existing = await getContractorQuote(user.id, id.data, org.id);
    await submitQuote(user.id, id.data, org.id, parsed.data);
    return done(orgId, existing && existing.status === "submitted" ? "Quote updated. The customer was told about the change." : "Quote sent to the customer.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

/** The awarded contractor reports the project done; the customer then confirms. */
export async function reportWorkCompleteAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgDispatcher(orgId, "contractor");
    const id = uuid.safeParse(requestId);
    const request = id.success ? await getRequest(user.id, id.data) : null;
    if (!request || request.awarded_contractor_id !== org.id) throw new UserFacingError("Project not found.");
    const parsed = completionNoteSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await reportWorkComplete(user.id, request.id, parsed.data.note);
    return done(orgId, `Reported complete. ${request.customer_name} was asked to confirm.`);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function withdrawQuoteAction(orgId: string, requestId: string): Promise<FormState> {
  try {
    const { user, org } = await requireOrgDispatcher(orgId, "contractor");
    const id = uuid.safeParse(requestId);
    const quote = id.success ? await getContractorQuote(user.id, id.data, org.id) : null;
    if (!quote) throw new UserFacingError("Quote not found.");
    await withdrawQuote(user.id, quote.id);
    return done(orgId, "Quote withdrawn.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

// Subcontracts ------------------------------------------------------------------

/** A subcontract on this request that this business is part of, on either side. */
async function requireSubcontract(orgId: string, requestId: string, subcontractId: unknown, dispatch = true) {
  const { user, org } = dispatch ? await requireOrgDispatcher(orgId, "contractor") : await requireMembership(orgId);
  const rid = uuid.safeParse(requestId);
  const sid = uuid.safeParse(subcontractId);
  const all = rid.success && sid.success ? await listProjectSubcontracts(user.id, rid.data) : [];
  const subcontract = all.find((s) => s.id === sid.data && (s.prime_id === org.id || s.sub_id === org.id));
  if (!subcontract) throw new UserFacingError("Subcontract not found.");
  return { user, org, subcontract, requestId: rid.data as string };
}

export async function offerSubcontractAction(orgId: string, requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgDispatcher(orgId, "contractor");
    const id = uuid.safeParse(requestId);
    const request = id.success ? await getRequest(user.id, id.data) : null;
    if (!request || request.awarded_contractor_id !== org.id) throw new UserFacingError("Project not found.");
    const parsed = subcontractOfferSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await offerSubcontract(user.id, request.id, parsed.data);
    return done(orgId, "Offer sent. They'll get a QuickPro notification and can accept or decline.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function respondToSubcontractAction(
  orgId: string,
  requestId: string,
  subcontractId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  let accept: boolean;
  try {
    const { user, org, subcontract } = await requireSubcontract(orgId, requestId, subcontractId);
    if (subcontract.sub_id !== org.id) throw new UserFacingError("Subcontract not found.");
    const parsed = subcontractResponseSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    accept = parsed.data.decision === "accept";
    await respondToSubcontract(user.id, subcontract.id, accept, parsed.data.note);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath(`/app/org/${orgId}`, "layout");
  redirect(`/app/org/${orgId}/requests/${requestId}?subcontract=${accept ? "accepted" : "declined"}`);
}

export async function cancelSubcontractAction(
  orgId: string,
  requestId: string,
  subcontractId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { user, subcontract } = await requireSubcontract(orgId, requestId, subcontractId);
    const parsed = reasonSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await cancelSubcontract(user.id, subcontract.id, parsed.data.reason);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath(`/app/org/${orgId}`, "layout");
  redirect(`/app/org/${orgId}/requests/${requestId}?subcontract=ended`);
}

export async function completeSubcontractAction(
  orgId: string,
  requestId: string,
  subcontractId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { user, org, subcontract } = await requireSubcontract(orgId, requestId, subcontractId);
    if (subcontract.sub_id !== org.id) throw new UserFacingError("Subcontract not found.");
    const parsed = completionNoteSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await completeSubcontract(user.id, subcontract.id, parsed.data.note);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath(`/app/org/${orgId}`, "layout");
  redirect(`/app/org/${orgId}/requests/${requestId}?subcontract=completed`);
}

export async function postSubcontractMessageAction(
  orgId: string,
  requestId: string,
  subcontractId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { user, subcontract } = await requireSubcontract(orgId, requestId, subcontractId, false);
    const parsed = messageSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await postSubcontractMessage(user.id, subcontract.id, parsed.data.body);
    return done(orgId, "Sent.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
