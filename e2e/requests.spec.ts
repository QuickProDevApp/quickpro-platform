import { expect, test } from "@playwright/test";
import { createConfirmedAccount, newYorkDate, seedApprovedContractor, seedApprovedCustomer, seedContractorCoverage, signIn } from "./support";

test("a customer posts a request, a contractor quotes, and the customer awards the work", async ({ browser }, testInfo) => {
  // Two people and seven screens; the dev server compiles each on first visit.
  test.slow();
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const manager = await createConfirmedAccount("Priya Manager", "reqcustomer");
  const customerId = await seedApprovedCustomer(manager.id, `Carleton Office Park ${tag}`);
  const owner = await createConfirmedAccount("Marcus Bell", "reqcontractor");
  const contractorName = `Harborline Facility ${tag}`;
  const contractorId = await seedApprovedContractor(owner.id, contractorName);
  await seedContractorCoverage(contractorId, "commercial-cleaning", "islip");
  const title = `Nightly office cleaning ${tag}`;

  const customer = await (await browser.newContext({ ...testInfo.project.use })).newPage();
  const contractor = await (await browser.newContext({ ...testInfo.project.use })).newPage();

  // The customer posts a request; validation errors come back on the form.
  await signIn(customer, manager.email, `/app/org/${customerId}/requests/new`);
  await customer.getByLabel("Title").fill(title);
  await customer.getByLabel("Service").selectOption({ label: "Commercial cleaning" });
  await customer.getByLabel("Town").selectOption({ label: "Islip" });
  await customer.getByLabel("Scope").fill("Too short");
  await customer.getByLabel("Preferred start").fill(newYorkDate(10));
  await customer.getByRole("button", { name: "Post request" }).click();
  await expect(customer.getByText(/Describe the work in a sentence or two/)).toBeVisible();
  await customer.getByLabel("Scope").fill("Three floors, about 24,000 square feet, five nights a week.");
  await customer.getByLabel("Budget up to (USD)").fill("4,000");
  await customer.getByRole("button", { name: "Post request" }).click();
  await expect(customer.getByText(/Request posted/)).toBeVisible();
  await expect(customer.getByText("No quotes yet")).toBeVisible();

  // The contractor finds it from the notification and quotes without seeing the address.
  await signIn(contractor, owner.email, "/app/notifications");
  await contractor.getByRole("link", { name: new RegExp(`New request: ${title}`) }).click();
  await expect(contractor.getByRole("heading", { name: title })).toBeVisible();
  await expect(contractor.getByText("200 Carleton Ave")).toHaveCount(0);
  await contractor.getByLabel("Total price (USD)").fill("3,200");
  await contractor.getByLabel("What's included").fill("Nightly cleaning of all three floors, restrooms and break rooms.");
  await contractor.getByRole("button", { name: "Send quote" }).click();
  await expect(contractor.getByText("Quote sent to the customer.")).toBeVisible();
  await expect(contractor.getByText("Waiting for customer")).toBeVisible();

  // The customer compares and accepts it behind a confirmation.
  await customer.reload();
  const quote = customer.getByTestId("quote");
  await expect(quote).toContainText(contractorName);
  await expect(quote).toContainText("$3,200.00");
  await quote.getByText("Accept quote").click();
  await quote.getByRole("button", { name: "Confirm and award" }).click();
  await expect(customer.getByText(/Quote accepted/)).toBeVisible();
  await expect(customer.getByText("Awarded", { exact: true }).first()).toBeVisible();

  // The contractor now sees the site and the work under Won.
  await contractor.goto(`/app/org/${contractorId}/requests?show=awarded`);
  await contractor.getByRole("link", { name: title }).click();
  await expect(contractor.getByText(/accepted your quote of \$3,200.00/)).toBeVisible();
  await expect(contractor.getByText(/200 Carleton Ave/)).toBeVisible();

  // Delivery and completion are covered end to end in marketplace-flow.spec.ts.
  await expect(contractor.getByRole("link", { name: "Schedule a job" })).toBeVisible();
});

test("customers browse approved contractors by service and town", async ({ page }, testInfo) => {
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const manager = await createConfirmedAccount("Dana Facilities", "dircustomer");
  const customerId = await seedApprovedCustomer(manager.id, `Directory Plaza ${tag}`);
  const owner = await createConfirmedAccount("Lee Landscaper", "dircontractor");
  const name = `Greenway Grounds ${tag}`;
  const contractorId = await seedApprovedContractor(owner.id, name);
  await seedContractorCoverage(contractorId, "landscaping", "brookhaven");

  await signIn(page, manager.email, `/app/org/${customerId}/contractors`);
  await page.getByLabel("Service").selectOption({ label: "Landscaping" });
  await page.getByLabel("Town").selectOption({ label: "Brookhaven" });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByTestId("contractor-row").filter({ hasText: name })).toBeVisible();
  await page.getByLabel("Town").selectOption({ label: "Islip" });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByTestId("contractor-row").filter({ hasText: name })).toHaveCount(0);
});
