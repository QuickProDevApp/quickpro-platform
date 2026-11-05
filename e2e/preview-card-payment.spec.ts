import { expect, test, type BrowserContext } from "@playwright/test";
import postgres from "postgres";
import Stripe from "stripe";
import {
  createConfirmedAccount,
  seedApprovedContractor,
  seedApprovedCustomer,
  seedAwardedProject,
  seedContractorCoverage,
  seedIssuedInvoice,
  signIn,
} from "./support";

/**
 * Card payments against Stripe's real test mode, on the deployed preview
 * (D-044). Runs only from the preview deploy workflow, which sets
 * E2E_REAL_STRIPE=1 and the test-mode key; the local suite uses the stand-in
 * (card-payments.spec.ts) instead.
 *
 * What is real here: the app's calls to Stripe, Stripe's hosted Checkout
 * page with the 4242 test card, and Stripe's signed webhook reaching the
 * preview and settling the invoice. What is not automated: filling in
 * Stripe's hosted payout onboarding form. The test checks that payout setup
 * reaches it, then pays a second business whose test-mode connected account
 * is created through the Stripe API with Stripe's test identity values.
 */
const REAL = process.env.E2E_REAL_STRIPE === "1";

test.skip(!REAL, "Runs against Stripe test mode from the preview workflow only.");

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!/^(sk|rk)_test_/.test(key)) throw new Error("A Stripe test-mode key is required.");
  return new Stripe(key);
}

/**
 * Pages talk to the protected preview with the bypass header, added only on
 * requests to the preview host, so it never reaches Stripe's pages.
 */
async function previewContext(browser: import("@playwright/test").Browser, use: object): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...use, extraHTTPHeaders: undefined });
  const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000");
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (secret) {
    await ctx.route(`${base.origin}/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), "x-vercel-protection-bypass": secret } }),
    );
  }
  return ctx;
}

test("payout setup reaches Stripe, and a customer pays an invoice on Stripe Checkout in test mode", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One run is enough against Stripe.");
  test.setTimeout(240_000);
  const s = stripe();
  const created: string[] = [];
  const tag = Math.random().toString(36).slice(2, 7);

  try {
    // 1. Payout setup goes to Stripe's hosted onboarding.
    const setupOwner = await createConfirmedAccount("Rita Payout", "stripesetup");
    const setupOrg = await seedApprovedContractor(setupOwner.id, `Payout Setup Co ${tag}`);
    const setupCtx = await previewContext(browser, testInfo.project.use);
    const setup = await setupCtx.newPage();
    await signIn(setup, setupOwner.email, `/app/org/${setupOrg}/payments`);
    await expect(setup.getByTestId("payout-status")).toHaveAttribute("data-state", "none");
    await setup.getByRole("button", { name: "Set up card payments with Stripe" }).click();
    await setup.waitForURL(/^https:\/\/connect\.stripe\.com\//, { timeout: 30_000 });
    const db = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {} });
    try {
      const [row] = await db<{ stripe_account_id: string }[]>`
        select stripe_account_id from public.stripe_accounts where organization_id = ${setupOrg}
      `;
      expect(row?.stripe_account_id).toMatch(/^acct_/);
      created.push(row.stripe_account_id);
    } finally {
      await db.end();
    }
    await setupCtx.close();

    // 2. A business whose test-mode account is ready to take cards.
    const customerOwner = await createConfirmedAccount("Dana Payer", "stripepayer");
    const customerId = await seedApprovedCustomer(customerOwner.id, `Harbor Point Test ${tag}`);
    const owner = await createConfirmedAccount("Marcus Payee", "stripepayee");
    const contractorName = `Bayview Test Build ${tag}`;
    const contractorId = await seedApprovedContractor(owner.id, contractorName);
    await seedContractorCoverage(contractorId, "carpentry", "islip");
    const account = await s.accounts.create({
      type: "custom",
      country: "US",
      business_type: "individual",
      email: owner.email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { mcc: "1520", product_description: "QuickPro preview test contractor" },
      // Stripe's documented test-mode identity values.
      individual: {
        first_name: "Marcus",
        last_name: "Payee",
        email: owner.email,
        phone: "0000000000",
        dob: { day: 1, month: 1, year: 1901 },
        address: { line1: "address_full_match", city: "Brentwood", state: "NY", postal_code: "11717", country: "US" },
        id_number: "000000000",
      },
      external_account: "btok_us_verified",
      tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
      metadata: { quickpro_organization_id: contractorId, quickpro_preview_test: "1" },
    });
    created.push(account.id);
    let ready = account;
    for (let i = 0; i < 20 && !ready.charges_enabled; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      ready = await s.accounts.retrieve(account.id);
    }
    expect(ready.charges_enabled, `Stripe did not enable charges: ${JSON.stringify(ready.requirements?.currently_due)}`).toBe(true);
    const sql = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {} });
    try {
      await sql.begin(async (tx) => {
        await tx`set local role quickpro_payments`;
        await tx`select app.payments_save_account(${contractorId}, ${account.id}, true, ${ready.payouts_enabled}, true, 0, ${owner.id})`;
      });
    } finally {
      await sql.end();
    }

    const requestId = await seedAwardedProject({
      customerOwnerId: customerOwner.id,
      customerId,
      contractorOwnerId: owner.id,
      contractorId,
      title: `Trim carpentry ${tag}`,
      amountCents: 125000,
    });
    const invoiceId = await seedIssuedInvoice(owner.id, requestId);

    // 3. The customer pays on Stripe Checkout with the 4242 test card.
    const payCtx = await previewContext(browser, testInfo.project.use);
    const customer = await payCtx.newPage();
    await signIn(customer, customerOwner.email, `/app/org/${customerId}/invoices/${invoiceId}`);
    await customer.getByRole("button", { name: "Pay $1,250.00 by card" }).click();
    await customer.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30_000 });
    const email = customer.locator("#email");
    if (await email.isVisible().catch(() => false)) await email.fill(customerOwner.email);
    await customer.locator("#cardNumber").fill("4242 4242 4242 4242");
    await customer.locator("#cardExpiry").fill("12 / 34");
    await customer.locator("#cardCvc").fill("123");
    await customer.locator("#billingName").fill("Dana Payer");
    const zip = customer.locator("#billingPostalCode");
    if (await zip.isVisible().catch(() => false)) await zip.fill("11717");
    await customer.locator('button[type="submit"]').first().click();
    await customer.waitForURL(`**/invoices/${invoiceId}?card=done`, { timeout: 60_000 });

    // 4. Stripe's signed webhook reaches the preview and settles the invoice.
    await expect
      .poll(
        async () => {
          await customer.reload();
          return customer.getByTestId("card-payment").getAttribute("data-status").catch(() => null);
        },
        { timeout: 90_000, intervals: [3000] },
      )
      .toBe("paid");
    await expect(customer.getByText("by card, through Stripe")).toBeVisible();

    // The contractor is notified.
    const contractorCtx = await previewContext(browser, testInfo.project.use);
    const contractor = await contractorCtx.newPage();
    await signIn(contractor, owner.email, "/app/notifications");
    await expect(contractor.getByRole("link", { name: /paid INV-0001 by card/ })).toBeVisible();
    await payCtx.close();
    await contractorCtx.close();
  } finally {
    // Test-mode connected accounts made by this run are removed from Stripe.
    for (const id of created) await s.accounts.del(id).catch(() => {});
  }
});
