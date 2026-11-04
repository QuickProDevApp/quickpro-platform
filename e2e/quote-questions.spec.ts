import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  seedApprovedContractor,
  seedApprovedCustomer,
  seedContractorCoverage,
  seedOpenRequest,
  signIn,
} from "./support";

/**
 * Questions before the award (D-041): a contractor asks about a request
 * before quoting, the customer answers and asks about the quote, a rival
 * never sees any of it, and accepting a quote closes the threads.
 */
test("customer and contractors talk privately before the award", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const customerOwner = await createConfirmedAccount("Priya Manager", "qacustomer");
  const customerName = `Carleton Office Park ${tag}`;
  const customerId = await seedApprovedCustomer(customerOwner.id, customerName);
  const owner = await createConfirmedAccount("Marcus Bell", "qacontractor");
  const contractorName = `Harborline Facility ${tag}`;
  const contractorId = await seedApprovedContractor(owner.id, contractorName);
  await seedContractorCoverage(contractorId, "commercial-cleaning", "islip");
  const rivalOwner = await createConfirmedAccount("Rita Rival", "qarival");
  const rivalId = await seedApprovedContractor(rivalOwner.id, `Rival Cleaning ${tag}`);
  await seedContractorCoverage(rivalId, "commercial-cleaning", "islip");
  const title = `Nightly office cleaning ${tag}`;
  const requestId = await seedOpenRequest({ customerOwnerId: customerOwner.id, customerId, title, category: "commercial-cleaning", town: "islip" });

  const contractor = await session();
  const customer = await session();
  const rival = await session();

  // The contractor asks before quoting.
  await signIn(contractor, owner.email, `/app/org/${contractorId}/requests/${requestId}`);
  await expect(contractor.getByRole("heading", { name: "Questions for the customer" })).toBeVisible();
  await contractor.getByLabel("New message").fill("Is the loading dock open after 6 PM?");
  await contractor.getByRole("button", { name: "Send", exact: true }).click();
  await expect(contractor.getByTestId("message")).toContainText(["Is the loading dock open after 6 PM?"]);

  // The customer follows the notification and answers in that contractor's thread.
  await signIn(customer, customerOwner.email, "/app/notifications");
  await customer.getByRole("link", { name: new RegExp(`Question from ${contractorName}`) }).click();
  await customer.waitForURL(`**/app/org/${customerId}/requests/${requestId}`);
  const thread = customer.getByTestId("quote-thread").filter({ hasText: contractorName });
  await expect(thread.getByText("Waiting for your reply")).toBeVisible();
  await expect(thread.getByTestId("message")).toContainText(["Is the loading dock open after 6 PM?"]);
  await thread.getByLabel("New message").fill("Yes, until 11 PM. Badge in at the front desk.");
  await thread.getByRole("button", { name: "Send", exact: true }).click();
  await expect(thread.getByTestId("message")).toHaveCount(2);
  await expect(thread.getByText("Waiting for your reply")).toHaveCount(0);

  // The rival sees the request but none of that conversation.
  await signIn(rival, rivalOwner.email, `/app/org/${rivalId}/requests/${requestId}`);
  await expect(rival.getByRole("heading", { name: "Questions for the customer" })).toBeVisible();
  await expect(rival.getByText("Is the loading dock open after 6 PM?")).toHaveCount(0);
  await expect(rival.getByTestId("message")).toHaveCount(0);

  // The contractor reads the answer and quotes.
  await contractor.reload();
  await expect(contractor.getByTestId("message")).toContainText(["Yes, until 11 PM. Badge in at the front desk."]);
  await contractor.getByLabel("Total price (USD)").fill("3,200");
  await contractor.getByLabel("What's included").fill("Nightly cleaning of all three floors, restrooms and break rooms.");
  await contractor.getByRole("button", { name: "Send quote" }).click();
  await expect(contractor.getByText("Quote sent to the customer.")).toBeVisible();

  // The rival quotes too; the customer asks it a question from the quote list.
  await rival.getByLabel("Total price (USD)").fill("2,900");
  await rival.getByLabel("What's included").fill("Nightly cleaning, all floors, supplies included.");
  await rival.getByRole("button", { name: "Send quote" }).click();
  await expect(rival.getByText("Quote sent to the customer.")).toBeVisible();
  await customer.reload();
  await customer.getByText("Ask a contractor a question…").click();
  await customer.getByLabel("Contractor", { exact: true }).selectOption({ label: `Rival Cleaning ${tag}` });
  await customer.getByLabel("Question", { exact: true }).fill("Does your price include weekends?");
  await customer.getByRole("button", { name: "Send question" }).click();
  // The new thread joins the list (and the form goes once everyone who quoted has a thread).
  await expect(customer.getByTestId("quote-thread")).toHaveCount(2);
  await expect(customer.getByTestId("quote-thread").filter({ hasText: `Rival Cleaning ${tag}` })).toBeVisible();

  // Accepting a quote closes the threads: still readable, no more messages.
  const quote = customer.getByTestId("quote").filter({ hasText: contractorName });
  await quote.getByText("Accept quote").click();
  await quote.getByRole("button", { name: "Confirm and award" }).click();
  await expect(customer.getByText(/Quote accepted/)).toBeVisible();
  await expect(customer.getByText("Closed when the request was awarded or cancelled. Kept for your records.")).toBeVisible();
  await expect(customer.getByText("Ask a contractor a question…")).toHaveCount(0);
  await rival.reload();
  await expect(rival.getByText("Does your price include weekends?")).toBeVisible();
  await expect(rival.getByLabel("New message")).toHaveCount(0);
});
