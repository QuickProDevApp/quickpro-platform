import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/session";
import { getEmailNotificationsEnabled } from "@/server/data/notifications";
import { getWorkerProfile } from "@/server/data/workers";
import { emailDeliveryEnabled } from "@/server/email";
import { changePasswordAction, emailNotificationsAction, updateAccountAction } from "./actions";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { password } = await searchParams;
  const user = await requireUser();
  const [worker, emailsOn] = await Promise.all([getWorkerProfile(user.id), getEmailNotificationsEnabled(user.id)]);
  const delivering = emailDeliveryEnabled();
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
        <CardHeader
          title="Email notifications"
          description="A copy of each QuickPro notification, sent to your sign-in email: offers, bookings, messages, quotes and hours."
        />
        <CardBody>
          <p className="text-sm" data-testid="email-notifications" data-state={emailsOn ? "on" : "off"}>
            {emailsOn ? (
              <>
                <span className="font-semibold text-ink">On.</span> We email {user.email}.
              </>
            ) : (
              <>
                <span className="font-semibold text-ink">Off.</span> You&apos;ll still see everything under
                Notifications in QuickPro.
              </>
            )}
          </p>
          {!delivering ? (
            <p className="mt-2 text-sm text-muted">
              QuickPro isn&apos;t sending email yet. Your choice applies once it does; until then notifications are
              in the app only.
            </p>
          ) : null}
          <ActionForm action={emailNotificationsAction} className="mt-4">
            <input type="hidden" name="enabled" value={emailsOn ? "off" : "on"} />
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              {emailsOn ? "Turn emails off" : "Turn emails on"}
            </SubmitButton>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">Text message alerts are planned, not live yet.</p>
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
