"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { cancelRequest, completeRequest } from "@/server/data/requests";
import { toUserMessage } from "@/server/errors";
import { fieldErrorsOf, formObject, reasonSchema, uuid, type FormState } from "@/lib/schemas";

export async function staffCancelRequestAction(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const parsed = reasonSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await cancelRequest(admin.id, uuid.parse(requestId), parsed.data.reason);
    revalidatePath("/app/admin/requests", "layout");
    return { ok: true, message: "Request cancelled. The customer and quoting contractors were notified." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function staffCompleteRequestAction(requestId: string): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    await completeRequest(admin.id, uuid.parse(requestId));
    revalidatePath("/app/admin/requests", "layout");
    return { ok: true, message: "Closed as complete. The contractor was notified." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
