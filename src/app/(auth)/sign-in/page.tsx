import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { safeNextPath } from "@/lib/paths";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; confirmed?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">Sign in to QuickPro</h1>
      {params.confirmed ? (
        <div className="mt-4">
          <FormMessage tone="ok">Your email is confirmed. Sign in to continue.</FormMessage>
        </div>
      ) : null}
      {params.error ? (
        <div className="mt-4">
          <FormMessage tone="bad">That link is invalid or has expired. Sign in, or sign up again for a new link.</FormMessage>
        </div>
      ) : null}
      <ActionForm action={signIn} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={safeNextPath(params.next)} />
        <Field name="email" label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field name="password" label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="pt-2">
          <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
        </div>
      </ActionForm>
      <p className="mt-6 text-sm text-muted">
        New to QuickPro?{" "}
        <Link href="/sign-up" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
