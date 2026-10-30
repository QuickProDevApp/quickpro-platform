import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/session";
import { getWorkerProfile } from "@/server/data/workers";
import { changePasswordAction, updateAccountAction } from "./actions";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { password } = await searchParams;
  const user = await requireUser();
  const worker = await getWorkerProfile(user.id);
  return (
    <>
      <PageHeader title="Your account" />
      {password === "reset" ? (
        <div className="mb-4 max-w-xl">
          <FormMessage tone="ok">Your new password is saved.</FormMessage>
        </div>
      ) : null}
      <div className="grid max-w-xl gap-6">
      <Card>
        <CardHeader title="Contact details" description="Used by QuickPro staff and, later, by businesses you work with." />
        <CardBody>
          <ActionForm action={updateAccountAction}>
            <Field name="email" label="Email">
              <Input name="email" value={user.email} disabled readOnly />
            </Field>
            <Field
              name="fullName"
              label="Full name"
              hint={worker?.status === "approved" ? "Changing your name sends your worker profile back to QuickPro staff for review." : undefined}
            >
              <Input name="fullName" defaultValue={user.fullName} autoComplete="name" />
            </Field>
            <Field name="phone" label="Mobile phone">
              <Input name="phone" type="tel" defaultValue={user.phone ?? ""} autoComplete="tel" />
            </Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Password" description="You'll stay signed in on this device." />
        <CardBody>
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <Field name="currentPassword" label="Current password">
              <Input name="currentPassword" type="password" autoComplete="current-password" />
            </Field>
            <Field name="password" label="New password" hint="At least 10 characters.">
              <Input name="password" type="password" autoComplete="new-password" />
            </Field>
            <Field name="confirm" label="Repeat the new password">
              <Input name="confirm" type="password" autoComplete="new-password" />
            </Field>
            <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
          </ActionForm>
          <p className="mt-4 text-sm text-muted">
            Forgot it? <a href="/forgot-password" className="font-medium text-brand hover:underline">Reset it by email</a> instead.
          </p>
        </CardBody>
      </Card>
      </div>
    </>
  );
}
