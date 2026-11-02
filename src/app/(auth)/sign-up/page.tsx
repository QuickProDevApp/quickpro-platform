import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/lib/paths";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create your account" };

const intro: Record<string, string> = {
  contractor: "Create your account, then register your business.",
  worker: "Create your account, then build your worker profile.",
  customer: "Create your account, then register your property or organization.",
};

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ as?: string; next?: string }> }) {
  const { as, next: requested } = await searchParams;
  const next = as && intro[as] ? `/app/onboarding?as=${as}` : safeNextPath(requested);
  return (
    <>
      <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">Create your QuickPro account</h1>
      <p className="mt-1 text-sm text-muted">{(as && intro[as]) || "One account works for businesses, workers and customers."}</p>
      <ActionForm action={signUp} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field name="fullName" label="Full name">
          <Input name="fullName" autoComplete="name" required />
        </Field>
        <Field name="email" label="Work email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field name="password" label="Password" hint="At least 10 characters.">
          <Input name="password" type="password" autoComplete="new-password" required />
        </Field>
        <div className="pt-2">
          <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
        </div>
      </ActionForm>
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href={next === "/app" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`} className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
