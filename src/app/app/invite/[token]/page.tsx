import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { LinkButton } from "@/components/ui/button";
import { ORG_ROLE_DESCRIPTION, ORG_ROLE_LABEL } from "@/lib/labels";
import { requireUser } from "@/server/auth/session";
import { getInvitationPreview } from "@/server/data/team";
import { acceptInvitationAction } from "./actions";

export const metadata: Metadata = { title: "Invitation" };

const TOKEN = /^[0-9a-f]{64}$/;

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser();
  const invite = TOKEN.test(token) ? await getInvitationPreview(user.id, token) : null;

  if (!invite) {
    return (
      <Notice title="This invitation link is not valid">
        Check that you copied the whole link, or ask the person who invited you for a new one.
      </Notice>
    );
  }
  if (invite.state !== "open") {
    const why = { accepted: "has already been used", revoked: "was withdrawn", expired: "has expired" }[invite.state];
    return (
      <Notice title={`This invitation ${why}`}>
        Ask someone at {invite.organization_name} for a new invitation if you still need access.
      </Notice>
    );
  }

  const wrongAccount = user.email.toLowerCase() !== invite.email;
  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader title={`Join ${invite.organization_name}`} />
        <CardBody className="space-y-4">
          <p className="text-sm text-ink">
            {invite.invited_by_name ?? "Someone"} invited <span className="font-medium">{invite.email}</span> to join as{" "}
            <span className="font-medium">{ORG_ROLE_LABEL[invite.role]}</span>.
          </p>
          <p className="text-sm text-muted">{ORG_ROLE_DESCRIPTION[invite.role]}</p>
          {wrongAccount ? (
            <FormMessage tone="bad">
              You&apos;re signed in as {user.email}. Sign out and sign in or create an account with {invite.email} to accept.
            </FormMessage>
          ) : (
            <ActionForm action={acceptInvitationAction.bind(null, token)}>
              <SubmitButton pendingLabel="Joining…">Accept and join</SubmitButton>
            </ActionForm>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader title={title} />
        <CardBody className="space-y-4">
          <p className="text-sm text-muted">{children}</p>
          <LinkButton href="/app" variant="secondary">Go to your dashboard</LinkButton>
        </CardBody>
      </Card>
    </div>
  );
}
