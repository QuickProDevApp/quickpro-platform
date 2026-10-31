"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { withUser } from "@/server/db/client";
import { toUserMessage } from "@/server/errors";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { accountSchema, changePasswordSchema, fieldErrorsOf, formObject, type FormState } from "@/lib/schemas";

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

/** Changes the password after checking the current one. */
export async function changePasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const check = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.currentPassword });
  if (check.error) return { ok: false, fieldErrors: { currentPassword: ["That isn't your current password."] } };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { ok: false, fieldErrors: { password: ["Choose a different password from your current one."] } };
    if (error.code === "weak_password") return { ok: false, fieldErrors: { password: [error.message] } };
    console.error("Password change failed", error.code, error.message);
    return { ok: false, message: "We couldn't change your password. Please try again." };
  }
  return { ok: true, message: "Password changed." };
}
