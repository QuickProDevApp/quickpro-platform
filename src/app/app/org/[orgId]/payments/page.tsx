import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";
import { setUpPayoutsAction } from "@/server/actions/payments";
import { canManage } from "@/server/data/organizations";
import { cardPaymentsAvailable, getPayoutAccount } from "@/server/payments";

export const metadata: Metadata = { title: "Card payments" };

export default async function OrganizationPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ setup?: string }>;
}) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "contractor") notFound();
  const { setup } = await searchParams;
  const available = cardPaymentsAvailable();
  const account = await getPayoutAccount(user.id, org.id);
  const manager = canManage(org.my_role);
  const ready = !!account?.charges_enabled;
  const state = !account ? "none" : ready ? (account.payouts_enabled ? "ready" : "charges") : "incomplete";

  return (
    <div className="grid max-w-2xl gap-6">
      {setup === "returned" && ready ? (
        <FormMessage tone="ok">You&apos;re set up. Businesses you invoice can now pay by card.</FormMessage>
      ) : null}
      {setup === "returned" && !ready ? (
        <FormMessage tone="info">
          Stripe still needs some details before you can take cards. Continue setup when you have them.
        </FormMessage>
      ) : null}
      {setup === "failed" ? (
        <FormMessage tone="bad">We couldn&apos;t reach Stripe just now. Please try again in a minute.</FormMessage>
      ) : null}

      <Card>
        <CardHeader
          title="Get paid by card"
          description="Let the businesses you invoice pay on a secure Stripe page. The money goes to your own Stripe account and reaches your bank on Stripe's payout schedule."
        />
        <CardBody className="space-y-4 text-sm text-ink-soft">
          <div className="flex flex-wrap items-center gap-2" data-testid="payout-status" data-state={state}>
            <span className="font-medium text-ink">Status:</span>
            {state === "none" ? <Badge>Not set up</Badge> : null}
            {state === "incomplete" ? <Badge dot tone="warn">Setup not finished</Badge> : null}
            {state === "charges" ? <Badge dot tone="warn">Taking cards; payouts pending</Badge> : null}
            {state === "ready" ? <Badge dot tone="ok">Taking cards</Badge> : null}
            {account ? <span className="text-xs text-muted">Checked {formatDateTime(account.updated_at)}</span> : null}
          </div>
          {account && account.requirements_due > 0 ? (
            <p>
              Stripe needs {account.requirements_due} more detail{account.requirements_due === 1 ? "" : "s"} from you.
            </p>
          ) : null}

          {!available ? (
            <p className="rounded-md bg-subtle px-3 py-2 text-[13px]">
              Card payments aren&apos;t available on QuickPro yet. Until they are, the businesses you bill pay you
              directly and you mark invoices paid.
            </p>
          ) : manager ? (
            state === "ready" || state === "charges" ? (
              <ActionForm action={setUpPayoutsAction.bind(null, org.id)}>
                <SubmitButton variant="secondary" pendingLabel="Opening Stripe…">
                  Update details on Stripe
                </SubmitButton>
              </ActionForm>
            ) : (
              <ActionForm action={setUpPayoutsAction.bind(null, org.id)}>
                <SubmitButton pendingLabel="Opening Stripe…">
                  {account ? "Continue setup on Stripe" : "Set up card payments with Stripe"}
                </SubmitButton>
              </ActionForm>
            )
          ) : (
            <p className="text-muted">Owners and admins on your team set up card payments.</p>
          )}
        </CardBody>
      </Card>

      {available ? (
      <Card>
        <CardHeader title="How it works" />
        <CardBody className="space-y-2 text-[13px] text-ink-soft">
          <p>Stripe verifies your business and bank account on its own pages. QuickPro never sees card or bank numbers.</p>
          <p>
            When you issue an invoice, the business you billed can pay it by card. The invoice is marked paid when Stripe
            confirms the payment, and both sides get a notification.
          </p>
          <p>
            Card payments are in test mode: no real cards are charged. QuickPro takes no fee. How Stripe&apos;s processing fee
            is shared will be set before live payments start, and shown here.
          </p>
          <p>You can still record payments made by check, ACH or other ways yourself.</p>
        </CardBody>
      </Card>
      ) : null}
    </div>
  );
}
