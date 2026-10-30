"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { env } from "@/server/env";
import { clearRecoverySession, isRecoverySession } from "@/server/auth/recovery";
import { getCurrentUser } from "@/server/auth/session";
import {
  emailOnlySchema,
  fieldErrorsOf,
  formObject,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
  type FormState,
} from "@/lib/schemas";
import { safeNextPath } from "@/lib/paths";

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const next = safeNextPath(formData.get("next"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${env().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    if (error.code !== "weak_password") console.error("Sign-up failed", error.code, error.message);
    return { ok: false, message: error.code === "weak_password" ? error.message : "We couldn't create your account. Check your details and try again." };
  }
  // With email confirmation on (the default), there is no session yet.
  if (data.session) redirect(next);
  redirect(`/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { ok: false, message: "Confirm your email address first. Check your inbox for the link we sent." };
    }
    return { ok: false, message: "That email and password don't match an account." };
  }
  redirect(safeNextPath(formData.get("next")));
}

/**
 * Sends a password-reset email. The answer is the same whether or not the
 * address has an account, so the form cannot be used to find accounts.
 */
export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env().NEXT_PUBLIC_SITE_URL}/auth/confirm?flow=recovery&next=${encodeURIComponent("/reset-password")}`,
  });
  if (error) {
    if (error.code === "over_email_send_rate_limit") {
      return { ok: false, message: "Too many emails were sent recently. Wait a few minutes and try again." };
    }
    console.error("Password reset request failed", error.code, error.message);
  }
  return {
    ok: true,
    message: `If ${parsed.data.email} has a QuickPro account, we sent it a link to choose a new password. Open it in this browser within an hour.`,
  };
}

/** Sends the sign-up confirmation email again. Same answer for unknown addresses. */
export async function resendConfirmation(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${env().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/app` },
  });
  if (error?.code === "over_email_send_rate_limit") {
    return { ok: false, message: "Too many emails were sent recently. Wait a few minutes and try again." };
  }
  if (error) console.error("Resending confirmation failed", error.code, error.message);
  return { ok: true, message: "If that account is waiting for confirmation, we sent a new link." };
}

/** Sets a new password right after following a reset link. */
export async function setNewPassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !(await isRecoverySession())) {
    return { ok: false, message: "This reset link has expired. Ask for a new one from the sign-in page." };
  }
  const parsed = newPasswordSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { ok: false, message: "Choose a password you haven't used for this account." };
    if (error.code === "weak_password") return { ok: false, message: error.message };
    console.error("Setting a new password failed", error.code, error.message);
    return { ok: false, message: "We couldn't change your password. Ask for a new reset link and try again." };
  }
  await clearRecoverySession();
  redirect("/app/account?password=reset");
}
