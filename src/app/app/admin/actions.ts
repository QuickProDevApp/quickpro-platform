"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { reviewDocument, reviewOrganization, reviewWorker } from "@/server/data/admin";
import { toUserMessage } from "@/server/errors";
import {
  documentReviewSchema,
  fieldErrorsOf,
  formObject,
  reviewDecisionSchema,
  uuid,
  type FormState,
} from "@/lib/schemas";

const DONE: Record<string, string> = {
  approved: "Approved.",
  rejected: "Changes requested. The owner can see your note.",
  suspended: "Suspended.",
};

export async function reviewOrganizationAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const parsed = reviewDecisionSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await reviewOrganization(admin.id, uuid.parse(orgId), parsed.data.decision, parsed.data.notes);
    revalidatePath("/app/admin", "layout");
    return { ok: true, message: DONE[parsed.data.decision] };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function reviewWorkerAction(workerId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const parsed = reviewDecisionSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await reviewWorker(admin.id, uuid.parse(workerId), parsed.data.decision, parsed.data.notes);
    revalidatePath("/app/admin", "layout");
    return { ok: true, message: DONE[parsed.data.decision] };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function reviewDocumentAction(documentId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const parsed = documentReviewSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await reviewDocument(admin.id, uuid.parse(documentId), parsed.data.decision, parsed.data.notes, parsed.data.expiresOn);
    revalidatePath("/app/admin", "layout");
    return { ok: true, message: parsed.data.decision === "approved" ? "Document marked as reviewed." : "Document not accepted." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
