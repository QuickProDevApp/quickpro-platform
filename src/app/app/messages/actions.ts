"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/server/auth/session";
import { hideJobMessage, postJobMessage } from "@/server/data/messages";
import { toUserMessage } from "@/server/errors";
import { fieldErrorsOf, formObject, hideMessageSchema, messageSchema, uuid, type FormState } from "@/lib/schemas";

/** Posts to a job's thread. The database checks that the user is in it. */
export async function postJobMessageAction(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const id = uuid.safeParse(jobId);
    if (!id.success) return { ok: false, message: "Job not found." };
    const parsed = messageSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await postJobMessage(user.id, id.data, parsed.data.body);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Sent." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function hideJobMessageAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const parsed = hideMessageSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await hideJobMessage(admin.id, parsed.data.messageId, parsed.data.reason);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Message hidden." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
