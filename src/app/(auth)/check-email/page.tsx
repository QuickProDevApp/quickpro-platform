import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { resendConfirmation } from "../actions";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <>
      <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">Check your email</h1>
      <p className="mt-2 text-sm text-muted">
        We sent a confirmation link to {email ? <strong className="text-ink">{email}</strong> : "your email address"}.
        Open it on this device to finish creating your account.
      </p>
      {email ? (
        <ActionForm action={resendConfirmation} className="mt-6 space-y-3">
          <input type="hidden" name="email" value={email} />
          <p className="text-sm text-muted">No email after a few minutes? Check your spam folder, or send it again.</p>
          <SubmitButton variant="secondary" pendingLabel="Sending…">
            Send the link again
          </SubmitButton>
        </ActionForm>
      ) : null}
      <p className="mt-6 text-sm text-muted">
        Already confirmed?{" "}
        <Link href="/sign-in" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
