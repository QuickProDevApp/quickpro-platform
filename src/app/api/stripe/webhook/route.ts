import { NextResponse, type NextRequest } from "next/server";
import { withPayments } from "@/server/db/client";
import { env } from "@/server/env";
import { handleStripeWebhook } from "@/server/payments/events";

/**
 * Stripe webhooks (D-040). The signature is checked against the endpoint
 * secrets before anything is read; each event is recorded once.
 */
export async function POST(request: NextRequest) {
  const e = env();
  const secrets = [e.STRIPE_WEBHOOK_SECRET, e.STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => !!s);
  if (secrets.length === 0) return new NextResponse("Not found", { status: 404 });
  const body = await request.text();
  try {
    const result = await handleStripeWebhook(body, request.headers.get("stripe-signature"), { run: withPayments, secrets });
    return NextResponse.json({ received: result.status === 200, outcome: result.outcome }, { status: result.status });
  } catch (error) {
    // Stripe retries on a 5xx, which is what a database hiccup needs.
    console.error("Stripe webhook failed", error);
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
