"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { applyToJob, cancelAssignment, checkIn, checkOut, respondToOffer, withdrawApplication } from "@/server/data/jobs";
import { toUserMessage } from "@/server/errors";
import { applicationSchema, fieldErrorsOf, formObject, reasonSchema, uuid, type FormState } from "@/lib/schemas";

// The database functions check that the signed-in user is the worker on the
// application or assignment; ids from the form are never trusted on their own.

function done(message: string): FormState {
  revalidatePath("/app/worker", "layout");
  return { ok: true, message };
}

export async function applyAction(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const parsed = applicationSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await applyToJob(user.id, uuid.parse(jobId), parsed.data.note);
    return done("Applied. The business can now see your profile and will offer the job if it's a fit.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function withdrawAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    await withdrawApplication(user.id, uuid.parse(formData.get("applicationId")));
    return done("Application withdrawn.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function respondAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const accept = formData.get("answer") === "accept";
    await respondToOffer(user.id, uuid.parse(formData.get("assignmentId")), accept);
    return done(accept ? "You're booked. The address and on-site contact are below." : "Offer declined.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function cancelMyAssignmentAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const parsed = reasonSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await cancelAssignment(user.id, uuid.parse(formData.get("assignmentId")), parsed.data.reason);
    return done("You've cancelled. The business can see your reason.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function checkInAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    await checkIn(user.id, uuid.parse(formData.get("assignmentId")));
    return done("Checked in.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function checkOutAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    await checkOut(user.id, uuid.parse(formData.get("assignmentId")));
    return done("Checked out. Thanks for your work.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
