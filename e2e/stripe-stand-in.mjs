// A local stand-in for the parts of Stripe QuickPro uses, for end-to-end
// tests only (D-040). It answers the API calls the app makes (Connect
// accounts, onboarding links, Checkout sessions), serves stand-ins for
// Stripe's hosted onboarding and payment pages, and sends webhooks signed
// exactly as Stripe signs them. It never talks to Stripe.
//
//   STRIPE_API_BASE=http://127.0.0.1:12111 STRIPE_WEBHOOK_SECRET=whsec_... \
//   node e2e/stripe-stand-in.mjs
//
// The app is pointed at it with the same STRIPE_API_BASE and a sk_test_ key.

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import Stripe from "stripe";

const base = new URL(process.env.STRIPE_API_BASE ?? "http://127.0.0.1:12111");
const secret = process.env.STRIPE_WEBHOOK_SECRET;
const webhookUrl = process.env.STAND_IN_WEBHOOK_URL ?? "http://localhost:3000/api/stripe/webhook";
if (!secret) throw new Error("Set STRIPE_WEBHOOK_SECRET");
const signer = new Stripe("sk_test_stand_in_signing_only");

const accounts = new Map();
const sessions = new Map();
const newId = (prefix) => `${prefix}_${randomBytes(12).toString("hex")}`;

function account(acct) {
  return {
    id: acct.id,
    object: "account",
    type: "express",
    email: acct.email,
    charges_enabled: acct.done,
    payouts_enabled: acct.done,
    details_submitted: acct.done,
    requirements: { currently_due: acct.done ? [] : ["external_account", "tos_acceptance.date"] },
    metadata: acct.metadata,
  };
}

async function send(type, object) {
  const body = JSON.stringify({
    id: newId("evt"),
    object: "event",
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  });
  const signature = signer.webhooks.generateTestHeaderString({ payload: body, secret });
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body,
  });
  console.log(`webhook ${type} -> ${res.status} ${await res.text()}`);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const page = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
  `<body style="font-family:system-ui;max-width:28rem;margin:2rem auto;padding:0 1rem"><p style="color:#a33">Local Stripe stand-in for tests</p><h1>${title}</h1>${body}</body></html>`;

async function readForm(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return new URLSearchParams(raw);
}

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json", "request-id": newId("req") });
  res.end(JSON.stringify(value));
}

function html(res, body) {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(303, { location });
  res.end();
}

createServer(async (req, res) => {
  const url = new URL(req.url, base);
  const path = url.pathname;
  try {
    if (path.startsWith("/v1/") && !(req.headers.authorization ?? "").startsWith("Bearer sk_test_")) {
      return json(res, 401, { error: { type: "invalid_request_error", message: "Test-mode key required." } });
    }
    if (req.method === "POST" && path === "/v1/accounts") {
      const f = await readForm(req);
      const acct = {
        id: newId("acct"),
        email: f.get("email"),
        done: false,
        metadata: { quickpro_organization_id: f.get("metadata[quickpro_organization_id]") },
      };
      accounts.set(acct.id, acct);
      return json(res, 200, account(acct));
    }
    if (req.method === "GET" && path.startsWith("/v1/accounts/")) {
      const acct = accounts.get(path.split("/")[3]);
      if (!acct) return json(res, 404, { error: { type: "invalid_request_error", message: "No such account" } });
      return json(res, 200, account(acct));
    }
    if (req.method === "POST" && path === "/v1/account_links") {
      const f = await readForm(req);
      const q = new URLSearchParams({ return_url: f.get("return_url"), refresh_url: f.get("refresh_url") });
      return json(res, 200, { object: "account_link", url: `${base.origin}/onboard/${f.get("account")}?${q}` });
    }
    if (req.method === "POST" && path === "/v1/checkout/sessions") {
      const f = await readForm(req);
      const quantity = Number(f.get("line_items[0][quantity]") ?? 1);
      const session = {
        id: newId("cs_test"),
        object: "checkout.session",
        mode: "payment",
        status: "open",
        payment_status: "unpaid",
        amount_total: Number(f.get("line_items[0][price_data][unit_amount]")) * quantity,
        currency: f.get("line_items[0][price_data][currency]"),
        client_reference_id: f.get("client_reference_id"),
        success_url: f.get("success_url"),
        cancel_url: f.get("cancel_url"),
        expires_at: Number(f.get("expires_at")),
        payment_intent: null,
      };
      const destination = f.get("payment_intent_data[transfer_data][destination]");
      if (!accounts.get(destination)?.done) {
        return json(res, 400, { error: { type: "invalid_request_error", message: "Destination can't take charges." } });
      }
      session.url = `${base.origin}/pay/${session.id}`;
      sessions.set(session.id, { session, name: f.get("line_items[0][price_data][product_data][name]") });
      return json(res, 200, session);
    }
    if (path.startsWith("/onboard/")) {
      const acct = accounts.get(path.split("/")[2]);
      if (!acct) return json(res, 404, {});
      if (req.method === "POST") {
        acct.done = true;
        await send("account.updated", account(acct));
        return redirect(res, url.searchParams.get("return_url"));
      }
      return html(
        res,
        page("Set up payouts", `<p>Business email: ${esc(acct.email)}</p><form method="post"><button>Submit test details</button></form>`),
      );
    }
    if (path.startsWith("/pay/")) {
      const entry = sessions.get(path.split("/")[2]);
      if (!entry) return json(res, 404, {});
      const { session, name } = entry;
      if (req.method === "POST") {
        const f = await readForm(req);
        if ((f.get("card") ?? "").replace(/\s/g, "") !== "4242424242424242") {
          return html(res, page("Card declined", `<p>Use the test card 4242 4242 4242 4242.</p><a href="${esc(session.url)}">Try again</a>`));
        }
        Object.assign(session, { status: "complete", payment_status: "paid", payment_intent: newId("pi_test") });
        await send("checkout.session.completed", session);
        return redirect(res, session.success_url);
      }
      return html(
        res,
        page(
          esc(name),
          `<p>Amount: $${(session.amount_total / 100).toFixed(2)}</p>` +
            `<form method="post"><label>Card number <input name="card" inputmode="numeric"></label> <button>Pay</button></form>` +
            `<p><a href="${esc(session.cancel_url)}">Cancel</a></p>`,
        ),
      );
    }
    json(res, 404, { error: { type: "invalid_request_error", message: `Not in the stand-in: ${req.method} ${path}` } });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: { type: "api_error", message: String(error) } });
  }
}).listen(Number(base.port), base.hostname, () => console.log(`Stripe stand-in on ${base.origin}`));
