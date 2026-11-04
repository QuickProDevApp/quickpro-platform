// Verifying and recording Stripe webhook events (D-040). Free of Next.js
// imports so database tests drive it directly.

import Stripe from "stripe";
import type { Tx } from "@/server/db/rls";

export type WebhookDeps = {
  /** Runs as the quickpro_payments role. */
  run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  /** Signing secrets of the endpoints that deliver here. */
  secrets: string[];
};

export type WebhookResult = { status: number; outcome: string };

// Only for webhook signature checks, which need no API key.
const verifier = new Stripe("sk_test_signature_checks_only", { maxNetworkRetries: 0, telemetry: false });

function verify(body: string, signature: string, secrets: string[]): Stripe.Event | null {
  for (const secret of secrets) {
    try {
      return verifier.webhooks.constructEvent(body, signature, secret);
    } catch {
      // Try the next endpoint's secret.
    }
  }
  return null;
}

/** Checks a webhook's signature and records it once. */
export async function handleStripeWebhook(body: string, signature: string | null, deps: WebhookDeps): Promise<WebhookResult> {
  if (!signature || deps.secrets.length === 0) return { status: 400, outcome: "unsigned" };
  const event = verify(body, signature, deps.secrets);
  if (!event) return { status: 400, outcome: "bad_signature" };
  // Live payments aren't approved: never let a live event change anything.
  if (event.livemode) return { status: 200, outcome: "live_ignored" };
  const outcome = await deps.run(async (tx) => {
    const [row] = await tx<{ outcome: string }[]>`
      select app.payments_handle_event(${event.id}, ${event.type}, ${tx.json(event.data.object as never)}) as outcome
    `;
    return row.outcome;
  });
  return { status: 200, outcome };
}
