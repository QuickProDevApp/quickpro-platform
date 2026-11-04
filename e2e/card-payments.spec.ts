import { expect, test } from "@playwright/test";
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
 * Card payments in Stripe test mode (D-040), against the local Stripe
 * stand-in (e2e/stripe-stand-in.mjs), which answers the API calls and sends
 * webhooks signed the way Stripe signs them.
 */
test("a contractor sets up card payments and the customer pays an invoice by card", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const customerOwner = await createConfirmedAccount("Priya Manager", "paycustomer");
  const customerId = await seedApprovedCustomer(customerOwner.id, `Carleton Office Park ${tag}`);
  const owner = await createConfirmedAccount("Marcus Bell", "paycontractor");
  const contractorName = `Harborline Facility ${tag}`;
  const contractorId = await seedApprovedContractor(owner.id, contractorName);
  await seedContractorCoverage(contractorId, "commercial-cleaning", "islip");
  const requestId = await seedAwardedProject({
    customerOwnerId: customerOwner.id,
    customerId,
    contractorOwnerId: owner.id,
    contractorId,
    title: `Office cleaning ${tag}`,
    amountCents: 320000,
  });
  const invoiceId = await seedIssuedInvoice(owner.id, requestId);

  const contractor = await (await browser.newContext({ ...testInfo.project.use })).newPage();
  const customer = await (await browser.newContext({ ...testInfo.project.use })).newPage();

  // Before setup, the customer is told to pay directly.
  await signIn(customer, customerOwner.email, `/app/org/${customerId}/invoices/${invoiceId}`);
  await expect(customer.getByText(`${contractorName} doesn't take card payments through QuickPro yet.`)).toBeVisible();
  await expect(customer.getByRole("button", { name: /by card/ })).toHaveCount(0);

  // The contractor connects a Stripe account through (stand-in) hosted onboarding.
  await signIn(contractor, owner.email, `/app/org/${contractorId}/payments`);
  await expect(contractor.getByTestId("payout-status")).toHaveAttribute("data-state", "none");
  await contractor.getByRole("button", { name: "Set up card payments with Stripe" }).click();
  await expect(contractor.getByRole("heading", { name: "Set up payouts" })).toBeVisible();
  await contractor.getByRole("button", { name: "Submit test details" }).click();
  await contractor.waitForURL(`**/app/org/${contractorId}/payments?setup=returned`);
  await expect(contractor.getByText("You're set up.")).toBeVisible();
  await expect(contractor.getByTestId("payout-status")).toHaveAttribute("data-state", "ready");

  // The customer pays on the (stand-in) Stripe page; the signed webhook settles the invoice.
  await customer.reload();
  await customer.getByRole("button", { name: "Pay $3,200.00 by card" }).click();
  await expect(customer.getByText("Amount: $3200.00")).toBeVisible();
  await customer.getByLabel("Card number").fill("4000 0000 0000 0002");
  await customer.getByRole("button", { name: "Pay" }).click();
  await expect(customer.getByRole("heading", { name: "Card declined" })).toBeVisible();
  await customer.getByRole("link", { name: "Try again" }).click();
  await customer.getByLabel("Card number").fill("4242 4242 4242 4242");
  await customer.getByRole("button", { name: "Pay" }).click();
  await customer.waitForURL(`**/invoices/${invoiceId}?card=done`);
  await expect(customer.getByText("Payment received. Thank you.")).toBeVisible();
  await expect(customer.getByText("by card, through Stripe")).toBeVisible();
  await expect(customer.getByTestId("card-payment")).toHaveAttribute("data-status", "paid");

  // The contractor is notified and sees it paid.
  await contractor.goto("/app/notifications");
  await contractor.getByRole("link", { name: /paid INV-0001 by card/ }).click();
  await contractor.waitForURL(`**/app/org/${contractorId}/invoices/${invoiceId}`);
  await expect(contractor.getByText("by card, through Stripe")).toBeVisible();
  await expect(contractor.getByRole("button", { name: "Mark paid" })).toHaveCount(0);
});
