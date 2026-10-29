"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { cancelAssignment, cancelJob, offerJob } from "@/server/data/jobs";
import { toUserMessage } from "@/server/errors";
import { fieldErrorsOf, formObject, reasonSchema, uuid, type FormState } from "@/lib/schemas";

function done(message: string): FormState {
  revalidatePath("/app/admin", "layout");
  return { ok: true, message };
}

/** Concierge matching: staff can offer a job to any approved worker. */
export async function staffOfferAction(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    await offerJob(admin.id, uuid.parse(jobId), uuid.parse(formData.get("workerId")));
    return done("Offer sent to the worker.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function staffCancelAssignmentAction(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const parsed = reasonSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await cancelAssignment(admin.id, uuid.parse(formData.get("assignmentId")), parsed.data.reason);
    return done("Assignment cancelled.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function staffCancelJobAction(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const parsed = reasonSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await cancelJob(admin.id, uuid.parse(jobId), parsed.data.reason);
    return done("Job cancelled.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
