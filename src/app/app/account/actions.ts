"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { withUser } from "@/server/db/client";
import { toUserMessage } from "@/server/errors";
import { accountSchema, fieldErrorsOf, formObject, type FormState } from "@/lib/schemas";

export async function updateAccountAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = accountSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    await withUser(user.id, (tx) => tx`
      update public.profiles set full_name = ${parsed.data.fullName}, phone = ${parsed.data.phone} where id = ${user.id}
    `);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Saved." };
}
