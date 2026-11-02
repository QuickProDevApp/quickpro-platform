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
  const next = safeNextPath(params.next);
  return (
    <>
      <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">Sign in to QuickPro</h1>
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
        <input type="hidden" name="next" value={next} />
        <Field name="email" label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field name="password" label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <p className="text-sm">
          <Link href="/forgot-password" className="font-medium text-brand hover:underline">
            Forgot your password?
          </Link>
        </p>
        <div className="pt-2">
          <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
        </div>
      </ActionForm>
      <p className="mt-6 text-sm text-muted">
        New to QuickPro?{" "}
        <Link href={next === "/app" ? "/sign-up" : `/sign-up?next=${encodeURIComponent(next)}`} className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
