import "server-only";
import Stripe from "stripe";
import { withPayments, withUser } from "@/server/db/client";
import { env } from "@/server/env";
import { UserFacingError } from "@/server/errors";

// Card payments on invoices through Stripe Connect, test mode only (D-040).

let client: Stripe | null | undefined;

/** The Stripe client, or null when card payments aren't configured. */
export function stripe(): Stripe | null {
  if (client !== undefined) return client;
  const e = env();
  if (!e.STRIPE_SECRET_KEY) return (client = null);
  const local = e.STRIPE_API_BASE ? new URL(e.STRIPE_API_BASE) : null;
  client = new Stripe(e.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    telemetry: false,
    ...(local ? { host: local.hostname, port: local.port, protocol: "http" as const } : {}),
  });
  return client;
}

export function cardPaymentsAvailable() {
  return stripe() !== null;
}

function required() {
  const s = stripe();
  if (!s) throw new UserFacingError("Card payments aren't available on QuickPro yet.");
  return s;
}

async function saveAccount(orgId: string, account: Stripe.Account, userId: string | null) {
  await withPayments((tx) => tx`
    select app.payments_save_account(
      ${orgId}, ${account.id}, ${account.charges_enabled ?? false}, ${account.payouts_enabled ?? false},
      ${account.details_submitted ?? false}, ${account.requirements?.currently_due?.length ?? 0}, ${userId}
    )
  `);
}

async function setupAccount(userId: string, orgId: string) {
  const [row] = await withUser(userId, (tx) => tx<{ id: string | null }[]>`select public.payout_setup_account(${orgId}) as id`);
  return row.id;
}

/**
 * Creates the business's Stripe Express account if it has none, and returns
 * a link to Stripe's hosted onboarding. Owners and admins only.
 */
export async function startPayoutSetup(userId: string, orgId: string, orgName: string, email: string) {
  const s = required();
  let accountId = await setupAccount(userId, orgId);
  if (!accountId) {
    const account = await s.accounts.create(
      {
        type: "express",
        country: "US",
        email,
        business_type: "company",
        company: { name: orgName },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { quickpro_organization_id: orgId },
      },
      { idempotencyKey: `quickpro-account-${orgId}` },
    );
    await saveAccount(orgId, account, userId);
    accountId = account.id;
  }
  const base = `${env().NEXT_PUBLIC_SITE_URL}/app/org/${orgId}/payments`;
  const link = await s.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${base}/setup`,
    return_url: `${base}/return`,
  });
  return link.url;
}

/** Reads the account back from Stripe after onboarding, for owners and admins. */
export async function refreshPayoutAccount(userId: string, orgId: string) {
  const s = required();
  const accountId = await setupAccount(userId, orgId);
  if (!accountId) return;
  await saveAccount(orgId, await s.accounts.retrieve(accountId), null);
}

export type PayoutAccount = {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_due: number;
  updated_at: Date;
};

export async function getPayoutAccount(userId: string, orgId: string) {
  const [row] = await withUser(userId, (tx) => tx<PayoutAccount[]>`
    select charges_enabled, payouts_enabled, details_submitted, requirements_due, updated_at
    from public.stripe_accounts where organization_id = ${orgId}
  `);
  return row ?? null;
}

/**
 * Starts a Stripe Checkout for an issued invoice, for the payer's
 * dispatchers. The money goes to the issuer's connected account; QuickPro
 * takes no fee. Returns the hosted payment page.
 */
export async function startCardPayment(userId: string, orgId: string, invoiceId: string) {
  const s = required();
  const [target] = await withUser(userId, (tx) => tx<
    { amount_cents: string; stripe_account_id: string; number: string; issuer_name: string; recipient_org_id: string }[]
  >`select * from public.card_payment_target(${invoiceId})`);
  if (target.recipient_org_id !== orgId) throw new UserFacingError("Invoice not found.");
  const amount = Number(target.amount_cents);
  const page = `${env().NEXT_PUBLIC_SITE_URL}/app/org/${orgId}/invoices/${invoiceId}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: { name: `Invoice ${target.number} from ${target.issuer_name}` },
        },
      },
    ],
    payment_intent_data: {
      on_behalf_of: target.stripe_account_id,
      transfer_data: { destination: target.stripe_account_id },
      metadata: { quickpro_invoice_id: invoiceId },
    },
    metadata: { quickpro_invoice_id: invoiceId },
    client_reference_id: invoiceId,
    expires_at: expiresAt,
    success_url: `${page}?card=done`,
    cancel_url: `${page}?card=cancelled`,
  });
  if (!session.url) throw new Error("Stripe returned a checkout session without a URL.");
  await withPayments((tx) => tx`
    select app.payments_open_checkout(${invoiceId}, ${session.id}, ${target.stripe_account_id}, ${amount}, ${userId},
                                      to_timestamp(${expiresAt}))
  `);
  return session.url;
}

export type CardPayment = { id: string; amount_cents: string; status: "open" | "paid" | "expired"; created_at: Date; completed_at: Date | null };

export async function getInvoiceCardInfo(userId: string, invoiceId: string) {
  return withUser(userId, async (tx) => {
    const [{ accepts }] = await tx<{ accepts: boolean }[]>`select public.invoice_accepts_cards(${invoiceId}) as accepts`;
    const payments = await tx<CardPayment[]>`
      select id, amount_cents, status, created_at, completed_at from public.invoice_card_payments
      where invoice_id = ${invoiceId} order by created_at desc limit 10
    `;
    return { accepts, payments };
  });
}
