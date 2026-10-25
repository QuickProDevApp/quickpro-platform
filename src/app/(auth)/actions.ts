"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { env } from "@/server/env";
import { fieldErrorsOf, formObject, signInSchema, signUpSchema, type FormState } from "@/lib/schemas";
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
