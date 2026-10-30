import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { isRecoverySession } from "@/server/auth/recovery";
import { getCurrentUser } from "@/server/auth/session";
import { setNewPassword } from "../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  const allowed = user && (await isRecoverySession());
  if (!allowed) {
    return (
      <>
        <h1 className="text-xl font-semibold">This link has expired</h1>
        <div className="mt-4">
          <FormMessage tone="bad">Password reset links work once, in the browser that asked for them, for a limited time.</FormMessage>
        </div>
        <p className="mt-6 text-sm text-muted">
          <Link href="/forgot-password" className="font-medium text-brand hover:underline">
            Send a new reset link
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted">For {user.email}. Use at least 10 characters.</p>
      <ActionForm action={setNewPassword} className="mt-6 space-y-4">
        <Field name="password" label="New password">
          <Input name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field name="confirm" label="Repeat the new password">
          <Input name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <div className="pt-2">
          <SubmitButton pendingLabel="Saving…">Save new password</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
