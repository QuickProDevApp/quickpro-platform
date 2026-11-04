import Stripe from "stripe";
import { afterAll, describe, expect, it } from "vitest";
import type { Tx } from "@/server/db/rls";
import { handleStripeWebhook } from "@/server/payments/events";
import {
  addMember,
  approvedCustomer,
  asUser,
  createAdmin,
  createApprovedContractor,
  createUser,
  postRequest,
  sql,
  submitQuote,
} from "./helpers";

// Card payments through Stripe Connect (D-040): who may set up payouts and
// pay, and what a signed Stripe event may change, once.

afterAll(() => sql.end());

const SECRET = "whsec_test_card_payments_suite";
const stripe = new Stripe("sk_test_only_for_signing_in_tests");

const asPayments = <T>(fn: (tx: Tx) => Promise<T>) =>
  sql.begin(async (tx) => {
    await tx`set local role quickpro_payments`;
    return fn(tx as unknown as Tx);
  }) as Promise<T>;

const uid = () => Math.random().toString(36).slice(2, 12);

/** An issued $3,200 invoice from a contractor to a customer. */
async function issued() {
  const admin = await createAdmin();
  const customer = await approvedCustomer(admin);
  const owner = await createUser("Marcus Bell");
  const orgId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
  const requestId = await postRequest(customer.owner, customer.orgId);
  const quote = await submitQuote(owner, requestId, orgId, 320000);
  await asUser(customer.owner, (tx) => tx`select public.accept_quote(${quote})`);
  const invoiceId = await asUser(owner, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select public.create_invoice('project'::public.work_context, ${requestId}) as id`;
    await tx`select public.issue_invoice(${id})`;
    return id;
  });
  return { admin, customer, owner, orgId, invoiceId };
}

const connect = (orgId: string, account: string, charges = true) =>
  asPayments((tx) => tx`select app.payments_save_account(${orgId}, ${account}, ${charges}, ${charges}, true, 0, null)`);

const target = (userId: string, invoiceId: string) =>
  asUser(userId, async (tx) => (await tx`select * from public.card_payment_target(${invoiceId})`)[0]);

function event(type: string, object: Record<string, unknown>, livemode = false) {
  const body = JSON.stringify({ id: `evt_${uid()}`, object: "event", type, livemode, api_version: "2026-09-30", data: { object } });
  return { body, signature: stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET }) };
}

const deliver = (e: { body: string; signature: string }) =>
  handleStripeWebhook(e.body, e.signature, { run: asPayments, secrets: ["whsec_other_endpoint_secret", SECRET] });

const invoiceRow = async (id: string) =>
  (await sql`select status, payment_method, payment_reference, paid_recorded_by from public.invoices where id = ${id}`)[0];

describe("card payments", () => {
  it("are set up by contractor owners and admins, and only Stripe's reports change the account", async () => {
    const p = await issued();
    const dispatcher = await createUser("Dee Dispatcher");
    await addMember(p.orgId, dispatcher, "dispatcher");
    const setup = (userId: string, orgId: string) =>
      asUser(userId, async (tx) => (await tx<{ id: string | null }[]>`select public.payout_setup_account(${orgId}) as id`)[0].id);

    expect(await setup(p.owner, p.orgId)).toBeNull();
    await expect(setup(dispatcher, p.orgId)).rejects.toThrow(/Only owners and admins/);
    await expect(setup(p.customer.owner, p.customer.orgId)).rejects.toThrow(/approved contractors/);
    await expect(setup(p.customer.owner, p.orgId)).rejects.toThrow(/Business not found/);

    // Nobody signed in can record an account; only the payments role.
    await expect(
      asUser(p.owner, (tx) => tx`select app.payments_save_account(${p.orgId}, 'acct_fake123', true, true, true, 0, null)`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(p.owner, (tx) => tx`insert into public.stripe_accounts (organization_id, stripe_account_id) values (${p.orgId}, 'acct_fake123')`),
    ).rejects.toThrow(/permission denied/);
    const account = `acct_${uid()}`;
    await connect(p.orgId, account, false);
    expect(await setup(p.owner, p.orgId)).toBe(account);
    // An organization keeps the account it connected.
    await expect(connect(p.orgId, `acct_${uid()}`)).rejects.toThrow(/different Stripe account/);

    // Members see the state, not the Stripe id; others see nothing.
    const [mine] = await asUser(dispatcher, (tx) => tx`select charges_enabled, requirements_due from public.stripe_accounts`);
    expect(mine).toEqual({ charges_enabled: false, requirements_due: 0 });
    await expect(asUser(dispatcher, (tx) => tx`select stripe_account_id from public.stripe_accounts`)).rejects.toThrow(
      /permission denied/,
    );
    expect(await asUser(p.customer.owner, (tx) => tx`select 1 from public.stripe_accounts`)).toHaveLength(0);

    // Stripe's account.updated turns cards on.
    expect(
      await deliver(event("account.updated", { id: account, object: "account", charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { currently_due: [] } })),
    ).toEqual({ status: 200, outcome: "account_updated" });
    const [now] = await sql`select charges_enabled, payouts_enabled from public.stripe_accounts where organization_id = ${p.orgId}`;
    expect(now).toEqual({ charges_enabled: true, payouts_enabled: true });
    const audit = await sql`select action from public.audit_log where entity_type = 'stripe_account' and entity_id = ${p.orgId} order by id`;
    expect(audit.map((a) => a.action)).toEqual(["stripe_account.created", "stripe_account.updated"]);
  });

  it("are paid by the billed business's dispatchers, and a signed Stripe event settles the invoice once", async () => {
    const p = await issued();
    const member = await createUser("Mo Member");
    await addMember(p.customer.orgId, member, "member");

    // Not before the contractor takes cards.
    await expect(target(p.customer.owner, p.invoiceId)).rejects.toThrow(/doesn't take card payments/);
    const account = `acct_${uid()}`;
    await connect(p.orgId, account);
    const t = await target(p.customer.owner, p.invoiceId);
    expect(t).toMatchObject({ amount_cents: "320000", stripe_account_id: account, number: "INV-0001" });
    await expect(target(member, p.invoiceId)).rejects.toThrow(/dispatchers on your team pay/);
    await expect(target(p.owner, p.invoiceId)).rejects.toThrow(/Invoice not found/);
    expect(await asUser(p.customer.owner, async (tx) => (await tx`select public.invoice_accepts_cards(${p.invoiceId}) as a`)[0].a)).toBe(true);

    // The server records the checkout it created; the amount must match.
    const session = `cs_test_${uid()}`;
    await expect(
      asPayments((tx) => tx`select app.payments_open_checkout(${p.invoiceId}, ${session}, ${account}, 1000, null, now() + interval '1 hour')`),
    ).rejects.toThrow(/invoice changed/);
    await asPayments((tx) => tx`
      select app.payments_open_checkout(${p.invoiceId}, ${session}, ${account}, 320000, ${p.customer.owner}, now() + interval '1 hour')
    `);
    await expect(
      asUser(p.customer.owner, (tx) => tx`select app.payments_open_checkout(${p.invoiceId}, 'cs_test_mine123', ${account}, 320000, null, now())`),
    ).rejects.toThrow(/permission denied/);

    // Unsigned, wrongly signed and live events change nothing.
    const paid = event("checkout.session.completed", { id: session, object: "checkout.session", payment_status: "paid", amount_total: 320000, payment_intent: "pi_test_abc123" });
    expect(await handleStripeWebhook(paid.body, null, { run: asPayments, secrets: [SECRET] })).toEqual({ status: 400, outcome: "unsigned" });
    expect(await handleStripeWebhook(paid.body, paid.signature, { run: asPayments, secrets: ["whsec_wrong_secret_value"] })).toEqual({
      status: 400,
      outcome: "bad_signature",
    });
    const tampered = paid.body.replace("320000", "1");
    expect((await handleStripeWebhook(tampered, paid.signature, { run: asPayments, secrets: [SECRET] })).outcome).toBe("bad_signature");
    expect((await deliver(event("checkout.session.completed", JSON.parse(paid.body).data.object, true))).outcome).toBe("live_ignored");
    // A different amount than was started doesn't settle it.
    expect((await deliver(event("checkout.session.completed", { ...JSON.parse(paid.body).data.object, amount_total: 1 }))).outcome).toBe(
      "amount_mismatch",
    );
    expect((await invoiceRow(p.invoiceId)).status).toBe("issued");

    // The real thing settles it, once.
    expect(await deliver(paid)).toEqual({ status: 200, outcome: "settled" });
    expect(await deliver(paid)).toEqual({ status: 200, outcome: "duplicate" });
    expect(await invoiceRow(p.invoiceId)).toEqual({
      status: "paid",
      payment_method: "card",
      payment_reference: "pi_test_abc123",
      paid_recorded_by: null,
    });
    const [pay] = await asUser(p.customer.owner, (tx) => tx`select status, payment_intent_id from public.invoice_card_payments`);
    expect(pay).toEqual({ status: "paid", payment_intent_id: "pi_test_abc123" });
    const titles = await sql<{ user_id: string; kind: string; title: string }[]>`
      select user_id, kind, title from public.notifications
      where kind in ('invoice.card_paid', 'invoice.paid') and user_id in (${p.owner}, ${p.customer.owner})
    `;
    expect(titles.map((n) => [n.user_id === p.owner ? "contractor" : "customer", n.kind]).sort()).toEqual([
      ["contractor", "invoice.card_paid"],
      ["customer", "invoice.paid"],
    ]);
    // A second Stripe event for the same session is a no-op.
    expect((await deliver(event("checkout.session.completed", JSON.parse(paid.body).data.object))).outcome).toBe("already_paid");
    // The payments role can't read or change anything directly.
    await expect(asPayments((tx) => tx`select * from public.invoices`)).rejects.toThrow(/permission denied/);
    await expect(asPayments((tx) => tx`select * from public.stripe_events`)).rejects.toThrow(/permission denied/);
  });

  it("expire unfinished checkouts, and flag a payment on an invoice that was already voided", async () => {
    const p = await issued();
    const account = `acct_${uid()}`;
    await connect(p.orgId, account);
    const s1 = `cs_test_${uid()}`;
    const s2 = `cs_test_${uid()}`;
    for (const s of [s1, s2]) {
      await asPayments((tx) => tx`
        select app.payments_open_checkout(${p.invoiceId}, ${s}, ${account}, 320000, ${p.customer.owner}, now() + interval '1 hour')
      `);
    }
    expect((await deliver(event("checkout.session.expired", { id: s1, object: "checkout.session" }))).outcome).toBe("expired");
    expect((await deliver(event("checkout.session.expired", { id: "cs_test_unknown01" }))).outcome).toBe("unknown_session");
    expect((await deliver(event("customer.created", { id: "cus_123" }))).outcome).toBe("ignored");

    // Voided while the payer was on the Stripe page: the invoice stays void and the contractor is told.
    await asUser(p.owner, (tx) => tx`select public.void_invoice(${p.invoiceId}, 'Billed the wrong project.')`);
    const late = event("checkout.session.completed", { id: s2, payment_status: "paid", amount_total: 320000, payment_intent: "pi_test_late01" });
    expect((await deliver(late)).outcome).toBe("invoice_not_open");
    expect((await invoiceRow(p.invoiceId)).status).toBe("void");
    const [n] = await sql`select title from public.notifications where user_id = ${p.owner} and kind = 'invoice.card_payment_extra'`;
    expect(n.title).toBe("Card payment on INV-0001 that was already void");
    expect(
      (await sql`select status from public.invoice_card_payments where invoice_id = ${p.invoiceId} order by created_at`).map((r) => r.status),
    ).toEqual(["expired", "paid"]);
    // Staff see the event ledger; others don't.
    expect(await asUser(p.admin, (tx) => tx`select 1 from public.stripe_events`)).not.toHaveLength(0);
    expect(await asUser(p.owner, (tx) => tx`select 1 from public.stripe_events`)).toHaveLength(0);
  });
});
