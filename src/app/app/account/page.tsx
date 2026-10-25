import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/session";
import { updateAccountAction } from "./actions";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Your account" />
      <Card className="max-w-xl">
        <CardHeader title="Contact details" description="Used by QuickPro staff and, later, by businesses you work with." />
        <CardBody>
          <ActionForm action={updateAccountAction}>
            <Field name="email" label="Email">
              <Input name="email" value={user.email} disabled readOnly />
            </Field>
            <Field name="fullName" label="Full name">
              <Input name="fullName" defaultValue={user.fullName} autoComplete="name" />
            </Field>
            <Field name="phone" label="Mobile phone">
              <Input name="phone" type="tel" defaultValue={user.phone ?? ""} autoComplete="tel" />
            </Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
