import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  seedApprovedContractor,
  seedApprovedCustomer,
  seedAwardedProject,
  seedContractorCoverage,
  seedSubcontract,
  signIn,
} from "./support";

/**
 * Invoicing between businesses, with separate customer, contractor and
 * subcontractor accounts, each in its own browser session. The project
 * starts awarded with an accepted subcontract (made through the real
 * workflow functions; covered by the marketplace and subcontract specs).
 *
 * The contractor drafts an invoice prefilled from the accepted quote, adds a
 * line and sales tax, and issues it; the customer sees it only once issued
 * and is told to pay directly; the contractor records the payment. The
 * subcontractor bills the contractor, out of the customer's sight, then
 * voids that invoice with a reason.
 */
test("contractor bills the customer, subcontractor bills the contractor", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const customerOwner = await createConfirmedAccount("Priya Manager", "invcustomer");
  const customerName = `Carleton Office Park ${tag}`;
  const customerId = await seedApprovedCustomer(customerOwner.id, customerName);
  const primeOwner = await createConfirmedAccount("Marcus Bell", "invprime");
  const primeName = `Harborline Facility ${tag}`;
  const primeId = await seedApprovedContractor(primeOwner.id, primeName);
  await seedContractorCoverage(primeId, "commercial-cleaning", "islip");
  const subOwner = await createConfirmedAccount("Sofia Reyes", "invsub");
  const subName = `Reyes Window Works ${tag}`;
  const subId = await seedApprovedContractor(subOwner.id, subName);
  const title = `Office cleaning ${tag}`;
  const requestId = await seedAwardedProject({
    customerOwnerId: customerOwner.id,
    customerId,
    contractorOwnerId: primeOwner.id,
    contractorId: primeId,
    title,
  });
  await seedSubcontract({
    requestId,
    primeOwnerId: primeOwner.id,
    subId,
    subOwnerId: subOwner.id,
    scope: "Exterior glass on the south face.",
    amountCents: 85000,
  });

  const customer = await session();
  const prime = await session();
  const sub = await session();

  // 1. The contractor starts an invoice from the project, prefilled from the quote.
  await signIn(prime, primeOwner.email, `/app/org/${primeId}/requests/${requestId}`);
  await prime.getByRole("button", { name: "Create an invoice" }).click();
  await prime.waitForURL(/\/invoices\/[0-9a-f-]+$/);
  const invoicePath = new URL(prime.url()).pathname;
  const invoiceId = invoicePath.split("/").pop()!;
  await expect(prime.getByLabel("Line 1 description")).toHaveValue(`Work on ${title}`);
  await expect(prime.getByLabel("Line 1 unit price in dollars")).toHaveValue("3200.00");

  // 2. Adds a line and sales tax; the preview and the saved invoice agree.
  await prime.getByRole("button", { name: "+ Add a line" }).click();
  await prime.getByLabel("Line 2 description").fill("Extra night, lobby carpets");
  await prime.getByLabel("Line 2 unit price in dollars").fill("400");
  await prime.getByLabel("Sales tax rate (%)").fill("8.625");
  await expect(prime.getByTestId("invoice-total-preview")).toHaveText("$3,910.50");
  await prime.getByLabel("How to pay you").fill(`Checks payable to ${primeName} LLC.`);
  await prime.getByRole("button", { name: "Save draft" }).click();
  await expect(prime.getByText("Draft saved.")).toBeVisible();
  await expect(prime.getByTestId("invoice-total")).toHaveText("$3,910.50");

  // The customer doesn't see a draft.
  await signIn(customer, customerOwner.email, `/app/org/${customerId}/invoices`);
  await expect(customer.getByText("Invoices from contractors you hired appear here.")).toBeVisible();
  expect((await customer.goto(`/app/org/${customerId}/invoices/${invoiceId}`))?.status()).toBe(404);

  // 3. Issued: numbered, frozen, and the customer can open it.
  await prime.getByRole("button", { name: "Issue invoice" }).click();
  await prime.waitForURL(/\?issued=1/);
  await expect(prime.getByText(/Invoice INV-0001 issued\./)).toBeVisible();
  await expect(prime.getByLabel("Line 1 description")).toHaveCount(0);

  await customer.goto(`/app/org/${customerId}/invoices`);
  const row = customer.getByTestId("invoice-row");
  await expect(row).toContainText("INV-0001");
  await expect(row).toContainText(`From ${primeName}`);
  await expect(row).toContainText("$3,910.50");
  await expect(row).toContainText("Awaiting payment");
  await row.click();
  await expect(customer.getByTestId("invoice-document")).toContainText("Extra night, lobby carpets");
  await expect(customer.getByTestId("invoice-document")).toContainText(`Checks payable to ${primeName} LLC.`);
  await expect(customer.getByText(`Pay ${primeName} directly as the invoice describes.`, { exact: false })).toBeVisible();
  await expect(customer.getByRole("button", { name: "Mark paid" })).toHaveCount(0);

  // 4. The contractor records the payment; the customer sees it paid.
  await prime.getByLabel("How it was paid").selectOption({ label: "Check" });
  await prime.getByLabel("Reference").fill("Check 1042");
  await prime.getByRole("button", { name: "Mark paid" }).click();
  // The payment form gives way to the payment record.
  await expect(prime.getByRole("heading", { name: "Paid" })).toBeVisible();
  await expect(prime.getByText("Reference: Check 1042")).toBeVisible();
  await customer.reload();
  await expect(customer.getByText("Paid", { exact: true }).first()).toBeVisible();
  await customer.goto(`/app/org/${customerId}/requests/${requestId}`);
  await expect(customer.getByTestId("work-invoice")).toContainText("INV-0001");

  // 5. The subcontractor bills the contractor for its part; the customer never sees it.
  await signIn(sub, subOwner.email, `/app/org/${subId}/requests/${requestId}`);
  await sub.getByRole("button", { name: "Create an invoice" }).click();
  await sub.waitForURL(/\/invoices\/[0-9a-f-]+$/);
  await expect(sub.getByLabel("Line 1 unit price in dollars")).toHaveValue("850.00");
  await sub.getByRole("button", { name: "Issue invoice" }).click();
  await sub.waitForURL(/\?issued=1/);
  await expect(sub.getByText(/Invoice INV-0001 issued\./)).toBeVisible();

  await prime.goto(`/app/org/${primeId}/invoices?show=received`);
  await expect(prime.getByTestId("invoice-row")).toContainText(`From ${subName}`);
  await expect(prime.getByTestId("invoice-row")).toContainText("$850.00");
  await customer.goto(`/app/org/${customerId}/invoices`);
  await expect(customer.getByTestId("invoice-row")).toHaveCount(1);

  // 6. The subcontractor voids it with a reason the contractor sees.
  await sub.getByText("Void this invoice…").click();
  await sub.getByLabel("Why").fill("Wrong amount; will reissue after the walk-through.");
  await sub.getByRole("button", { name: "Void invoice" }).click();
  await expect(sub.getByText(/Voided .*Wrong amount; will reissue/)).toBeVisible();
  await prime.reload();
  await expect(prime.getByTestId("invoice-row")).toContainText("Void");
});
