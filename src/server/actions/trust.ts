"use server";

// Reviews and disputes, shared by every party's screens. The database decides
// who may do what on which piece of work; these re-check the user, validate
// input and map errors.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/server/auth/session";
import {
  openDispute,
  postDisputeMessage,
  resolveDispute,
  withdrawDispute,
} from "@/server/data/disputes";
import { flagReview, moderateReview, replyToReview, submitReview, type WorkContext } from "@/server/data/reviews";
import { toUserMessage, UserFacingError } from "@/server/errors";
import {
  disputeResolutionSchema,
  disputeSchema,
  fieldErrorsOf,
  formObject,
  messageSchema,
  moderateReviewSchema,
  reasonSchema,
  reviewFlagSchema,
  reviewReplySchema,
  reviewSchema,
  uuid,
  WORK_CONTEXTS,
  type FormState,
} from "@/lib/schemas";

function target(context: unknown, targetId: unknown): { context: WorkContext; targetId: string } {
  if (!WORK_CONTEXTS.includes(context as WorkContext) || !uuid.safeParse(targetId).success) {
    throw new UserFacingError("Not found.");
  }
  return { context: context as WorkContext, targetId: targetId as string };
}

function refresh(): void {
  revalidatePath("/app", "layout");
}

export async function submitReviewAction(context: WorkContext, targetId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const t = target(context, targetId);
    const parsed = reviewSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await submitReview(user.id, t.context, t.targetId, parsed.data.rating, parsed.data.body);
    refresh();
    return { ok: true, message: "Review saved." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function replyToReviewAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const parsed = reviewReplySchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await replyToReview(user.id, parsed.data.reviewId, parsed.data.reply);
    refresh();
    return { ok: true, message: "Reply posted." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function flagReviewAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const parsed = reviewFlagSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await flagReview(user.id, parsed.data.reviewId, parsed.data.reason);
    refresh();
    return { ok: true, message: "Sent to QuickPro staff. They'll decide whether the review stays up." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

/** Opens a dispute and goes to it: under the business when orgId is set, otherwise the worker's own. */
export async function openDisputeAction(
  context: WorkContext,
  targetId: string,
  orgId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  let id: string;
  try {
    const user = await requireUser();
    const t = target(context, targetId);
    if (orgId !== null && !uuid.safeParse(orgId).success) throw new UserFacingError("Not found.");
    const parsed = disputeSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    id = await openDispute(user.id, t.context, t.targetId, parsed.data);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  redirect(orgId ? `/app/org/${orgId}/disputes/${id}?opened=1` : `/app/worker/disputes/${id}?opened=1`);
}

export async function postDisputeMessageAction(disputeId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    if (!uuid.safeParse(disputeId).success) throw new UserFacingError("Dispute not found.");
    const parsed = messageSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await postDisputeMessage(user.id, disputeId, parsed.data.body);
    refresh();
    return { ok: true, message: "Sent." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function withdrawDisputeAction(disputeId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    if (!uuid.safeParse(disputeId).success) throw new UserFacingError("Dispute not found.");
    const note = String(formData.get("note") ?? "").trim();
    if (note.length > 1000) return { ok: false, fieldErrors: { note: ["Keep the note under 1,000 characters."] } };
    await withdrawDispute(user.id, disputeId, note);
    refresh();
    return { ok: true, message: "Dispute withdrawn. The other side and QuickPro staff were told." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

// Staff ------------------------------------------------------------------------

export async function resolveDisputeAction(disputeId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    if (!uuid.safeParse(disputeId).success) throw new UserFacingError("Dispute not found.");
    const parsed = disputeResolutionSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await resolveDispute(admin.id, disputeId, parsed.data.outcome, parsed.data.resolution);
    refresh();
    return { ok: true, message: "Dispute closed. Both sides were told the outcome." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

/** Hides a review or keeps it (clearing the flag), then returns to the list it was on. */
export async function moderateReviewAction(_: FormState, formData: FormData): Promise<FormState> {
  let done: "hidden" | "kept";
  try {
    const admin = await requireAdmin();
    const parsed = moderateReviewSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    const hide = parsed.data.decision === "hide";
    if (hide) {
      const reason = reasonSchema.safeParse({ reason: parsed.data.reason });
      if (!reason.success) return { ok: false, fieldErrors: { reason: ["Add the reason for hiding this review. Both sides see it."] } };
    }
    await moderateReview(admin.id, parsed.data.reviewId, hide, parsed.data.reason);
    done = hide ? "hidden" : "kept";
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  // The review usually leaves the list it was on, so confirm on the page itself.
  const show = String(formData.get("show") ?? "");
  const filter = ["hidden", "low", "all"].includes(show) ? `show=${show}&` : "";
  redirect(`/app/admin/reviews?${filter}done=${done}`);
}
