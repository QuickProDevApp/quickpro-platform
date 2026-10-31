import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm text-muted">Enter the email you signed up with. We&apos;ll send a link to choose a new password.</p>
      <ActionForm action={requestPasswordReset} className="mt-6 space-y-4">
        <Field name="email" label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <div className="pt-2">
          <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
        </div>
      </ActionForm>
      <p className="mt-6 text-sm text-muted">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
