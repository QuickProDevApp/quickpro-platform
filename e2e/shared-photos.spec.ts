import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  samplePhoto,
  seedApprovedContractor,
  seedApprovedCustomer,
  seedAwardedProject,
  seedContractorCoverage,
  seedOpenJob,
  signIn,
} from "./support";

/**
 * The customer follows the work on their project (D-036). The contractor
 * adds a checklist item and two photos to a project job and shares one; the
 * customer sees that photo (and can open it), not the other, and the
 * checklist progress; the contractor stops sharing and the customer loses it.
 */
test("the customer sees the photos the contractor shares and each job's checklist progress", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const tag = Math.random().toString(36).slice(2, 7);
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const customerOwner = await createConfirmedAccount("Casey Customer", "sharecust");
  const customerName = `Harbor Office Park ${tag}`;
  const customerId = await seedApprovedCustomer(customerOwner.id, customerName);
  const owner = await createConfirmedAccount("Marcus Bell", "shareprime");
  const contractorName = `Harborline Facility ${tag}`;
  const contractorId = await seedApprovedContractor(owner.id, contractorName);
  await seedContractorCoverage(contractorId, "commercial-cleaning", "islip");
  const title = `Office cleaning ${tag}`;
  const requestId = await seedAwardedProject({
    customerOwnerId: customerOwner.id,
    customerId,
    contractorOwnerId: owner.id,
    contractorId,
    title,
  });
  const jobTitle = `Lobby floors ${tag}`;
  const jobId = await seedOpenJob(owner.id, contractorId, jobTitle, 2, requestId);

  // The customer's project page before anything is shared.
  const customer = await session();
  const projectPath = `/app/org/${customerId}/requests/${requestId}`;
  await signIn(customer, customerOwner.email, projectPath);
  await expect(customer.getByRole("heading", { name: "Photos from the site" })).toBeVisible();
  await expect(customer.getByText("No photos shared yet")).toBeVisible();

  // The contractor builds the checklist and adds two photos; neither is shared yet.
  const contractor = await session();
  await signIn(contractor, owner.email, `/app/org/${contractorId}/jobs/${jobId}`);
  await expect(contractor.getByText(`${customerName} sees only the photos you share; 0 shared so far.`)).toBeVisible();
  await contractor.getByLabel("Add an item").fill("Wax the lobby");
  await contractor.getByRole("button", { name: "Add", exact: true }).click();
  await expect(contractor.getByTestId("checklist-item")).toHaveCount(1);
  await contractor.getByLabel("Add an item").fill("Replace the entrance mats");
  await contractor.getByRole("button", { name: "Add", exact: true }).click();
  await expect(contractor.getByTestId("checklist-item")).toHaveCount(2);
  for (const caption of ["Lobby after the second coat", "Supply closet"]) {
    await contractor.getByLabel("Add a photo").setInputFiles(samplePhoto);
    await contractor.getByLabel("Caption (optional)").fill(caption);
    await contractor.getByRole("button", { name: "Add photo" }).click();
    await expect(contractor.getByTestId("job-photo").filter({ hasText: caption })).toHaveCount(1);
  }
  const closetSrc = await contractor
    .getByTestId("job-photo")
    .filter({ hasText: "Supply closet" })
    .locator("img")
    .getAttribute("src");

  // Share one and tick one item off.
  await contractor.getByRole("button", { name: "Share with customer: Lobby after the second coat" }).click();
  const lobby = contractor.getByTestId("job-photo").filter({ hasText: "Lobby after the second coat" });
  await expect(lobby).toHaveAttribute("data-shared", "true");
  await expect(lobby.getByText("Shared", { exact: true })).toBeVisible();
  await expect(contractor.getByText(`${customerName} sees only the photos you share; 1 shared so far.`)).toBeVisible();
  await contractor.getByRole("button", { name: "Mark done: Wax the lobby" }).click();
  await expect(contractor.getByTestId("checklist-progress")).toHaveText("1 of 2 done");

  // The contractor's project page shows what the customer sees.
  await contractor.goto(`/app/org/${contractorId}/requests/${requestId}`);
  await expect(contractor.getByText(`What ${customerName} sees.`, { exact: false })).toBeVisible();
  await expect(contractor.getByTestId("project-photo")).toHaveCount(1);

  // The customer sees the shared photo, which loads, but not the other one.
  await customer.reload();
  const shared = customer.getByTestId("project-photo");
  await expect(shared).toHaveCount(1);
  await expect(shared).toContainText("Lobby after the second coat");
  await expect(shared).toContainText(jobTitle);
  await expect(shared).not.toContainText("Marcus Bell");
  await expect.poll(() => shared.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(8);
  expect((await customer.request.get(closetSrc!)).status()).toBe(404);

  // Checklist progress on the job, with the items on demand and no notes or names.
  const checklist = customer.getByTestId("project-checklist");
  await expect(checklist).toHaveAttribute("data-done", "1");
  await expect(checklist).toHaveAttribute("data-total", "2");
  await expect(checklist).toContainText("1 of 2 done");
  await expect(checklist.getByText("Replace the entrance mats")).toBeHidden();
  await checklist.locator("summary").click();
  await expect(checklist.getByText("Replace the entrance mats")).toBeVisible();
  await expect(checklist.getByText("Wax the lobby")).toBeVisible();

  // The customer was told photos were shared.
  await customer.goto("/app/notifications");
  await expect(customer.getByText(`New photos: ${title}`)).toBeVisible();

  // Stop sharing: the customer loses it.
  await contractor.goto(`/app/org/${contractorId}/jobs/${jobId}`);
  await contractor.getByRole("button", { name: "Stop sharing: Lobby after the second coat" }).click();
  await expect(lobby).toHaveAttribute("data-shared", "false");
  await customer.goto(projectPath);
  await expect(customer.getByText("No photos shared yet")).toBeVisible();
});
