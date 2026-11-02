import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  seedApprovedContractor,
  seedApprovedCustomer,
  seedApprovedWorker,
  seedAwardedProject,
  seedContractorCoverage,
  signIn,
  startJobNow,
} from "./support";

/**
 * Subcontracting part of a won project, with separate customer, prime
 * contractor, subcontractor and worker accounts, each in its own browser
 * session:
 *
 * the prime offers the exterior glass to a second contractor → the
 * subcontractor accepts and gets the site → schedules its own job → a worker
 * is booked, checks in and out → the subcontractor completes the job and
 * reports its part → the prime can then report the project → the customer
 * sees who did what (never the subcontract price) and confirms.
 *
 * The posting, quoting and award are covered by the marketplace flow spec,
 * so the project starts awarded (made through the real workflow functions).
 */
test("prime → subcontractor → worker → confirmed project", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const customerOwner = await createConfirmedAccount("Priya Manager", "subcustomer");
  const customerName = `Carleton Office Park ${tag}`;
  const customerId = await seedApprovedCustomer(customerOwner.id, customerName);
  const primeOwner = await createConfirmedAccount("Marcus Bell", "subprime");
  const primeName = `Harborline Facility ${tag}`;
  const primeId = await seedApprovedContractor(primeOwner.id, primeName);
  await seedContractorCoverage(primeId, "commercial-cleaning", "islip");
  const subOwner = await createConfirmedAccount("Sofia Reyes", "subsub");
  const subName = `Reyes Window Works ${tag}`;
  const subId = await seedApprovedContractor(subOwner.id, subName);
  await seedContractorCoverage(subId, "commercial-cleaning", "islip");
  const workerAccount = await createConfirmedAccount("Wendy Worker", "subworker");
  await seedApprovedWorker(workerAccount.id, "islip", "floor-care");
  const title = `Office cleaning and glass ${tag}`;
  const requestId = await seedAwardedProject({
    customerOwnerId: customerOwner.id,
    customerId,
    contractorOwnerId: primeOwner.id,
    contractorId: primeId,
    title,
  });
  const customerPath = `/app/org/${customerId}/requests/${requestId}`;
  const primePath = `/app/org/${primeId}/requests/${requestId}`;
  const subPath = `/app/org/${subId}/requests/${requestId}`;

  const customer = await session();
  const prime = await session();
  const sub = await session();
  const worker = await session();

  // Before any offer the second contractor can't open the project at all.
  await signIn(sub, subOwner.email, `/app/org/${subId}`);
  expect((await sub.goto(subPath))?.status()).toBe(404);

  // 1. The customer and the prime talk on their own thread.
  await signIn(customer, customerOwner.email, customerPath);
  await customer.getByLabel("New message").fill("Gate code for the lot is 4412.");
  await customer.getByRole("button", { name: "Send" }).click();
  await expect(customer.getByTestId("message")).toContainText("4412");

  // 2. The prime offers the exterior glass to the subcontractor.
  await signIn(prime, primeOwner.email, primePath);
  await prime.getByText("Hand off part of the work…").click();
  await prime.getByLabel("Subcontractor").selectOption({ label: subName });
  await prime.getByLabel("The part you're handing over").fill("Exterior glass on the south face, all three floors, by Friday.");
  await prime.getByLabel("Agreed price (USD)").fill("850");
  await prime.getByRole("button", { name: "Send offer" }).click();
  await expect(prime.getByText(/Offer sent\. They.ll get/)).toBeVisible();
  await expect(prime.getByTestId("subcontract-row")).toContainText("Offer sent");
  await expect(prime.getByTestId("subcontract-row")).toContainText("$850.00");

  // 3. The subcontractor sees the offer: scope and price, not the site or the prime's price.
  await sub.goto(`/app/org/${subId}`);
  await expect(sub.getByTestId("subcontract-item")).toContainText("Awaiting your answer");
  await sub.getByTestId("subcontract-item").click();
  await sub.waitForURL(new RegExp(`/requests/${requestId}`));
  await expect(sub.getByText(`${primeName} offered you part of this project`)).toBeVisible();
  await expect(sub.getByText("Exterior glass on the south face").first()).toBeVisible();
  await expect(sub.getByText("$850.00")).toBeVisible();
  await expect(sub.getByText("200 Carleton Ave")).toHaveCount(0);
  await expect(sub.getByText("$3,200.00")).toHaveCount(0);
  await sub.getByLabel("Note to the contractor").fill("We can do Thursday night.");
  await sub.getByRole("button", { name: "Accept subcontract" }).click();
  await expect(sub.getByText(/You accepted the subcontract/)).toBeVisible();
  await expect(sub.getByText(/200 Carleton Ave/).first()).toBeVisible();
  // The customer's thread with the prime stays private.
  await expect(sub.getByText("4412")).toHaveCount(0);

  // 4. The subcontractor schedules its own job, prefilled from the subcontract.
  await sub.getByRole("link", { name: "Schedule a job" }).click();
  await sub.waitForURL(/\/jobs\/new\?request=/);
  await expect(sub.getByRole("heading", { name: "Schedule a job for your part" })).toBeVisible();
  await expect(sub.getByLabel("What workers will do")).toHaveValue(/Exterior glass on the south face/);
  await expect(sub.getByLabel("Street address")).toHaveValue("200 Carleton Ave");
  const jobTitle = `South face glass ${tag}`;
  await sub.getByLabel("Job title").fill(jobTitle);
  await sub.getByText("Floor care (strip, wax, buff)").click();
  await sub.getByLabel("Start time").fill("18:00");
  await sub.getByLabel("End time").fill("23:00");
  await sub.getByLabel("People needed").fill("1");
  await sub.getByLabel("Hourly pay (USD)").fill("26.00");
  await sub.getByRole("button", { name: "Schedule job" }).click();
  await sub.waitForURL(/\/jobs\/[0-9a-f-]+\?posted=1/);
  const jobPath = new URL(sub.url()).pathname;
  const jobId = jobPath.split("/").pop()!;
  await expect(sub.getByRole("link", { name: new RegExp(`Project: ${title}`) })).toBeVisible();

  // 5. A worker is booked through the usual job flow.
  await signIn(worker, workerAccount.email, `/app/worker/jobs/${jobId}`);
  await expect(worker.getByText(subName).first()).toBeVisible();
  await expect(worker.getByText(customerName)).toHaveCount(0);
  await worker.getByRole("button", { name: "Apply for this job" }).click();
  await expect(worker.getByText("You applied", { exact: true })).toBeVisible();
  await sub.goto(jobPath);
  await sub.getByRole("button", { name: "Offer the job" }).click();
  await expect(sub.getByText("Offered (1)", { exact: true })).toBeVisible();
  await worker.reload();
  await worker.getByRole("button", { name: "Accept job" }).click();
  await expect(worker.getByText("200 Carleton Ave, Central Islip, NY 11722")).toBeVisible();

  // The prime and the customer follow the subcontractor's job on the project.
  await prime.reload();
  await expect(prime.getByTestId("project-job")).toContainText(subName);
  await expect(prime.getByTestId("project-job")).toContainText("1/1 booked");
  await customer.reload();
  await expect(customer.getByTestId("project-job")).toContainText(jobTitle);
  await expect(customer.getByTestId("project-business")).toContainText(subName);
  await expect(customer.getByText("$850.00")).toHaveCount(0);

  // 6. The prime and the subcontractor have their own thread.
  await sub.goto(subPath);
  await sub.getByLabel("New message").fill("Lift arrives Thursday at 5.");
  await sub.getByRole("button", { name: "Send" }).click();
  await expect(sub.getByTestId("message")).toContainText("Lift arrives");
  await prime.getByTestId("subcontract-row").getByRole("link", { name: subName }).click();
  await prime.waitForURL(/\/subcontracts\//);
  await expect(prime.getByTestId("message")).toContainText("Lift arrives");
  await prime.getByLabel("New message").fill("East lot is open for the lift.");
  await prime.getByRole("button", { name: "Send" }).click();
  await expect(prime.getByTestId("message").last()).toContainText("East lot");
  await customer.reload();
  await expect(customer.getByText("Lift arrives")).toHaveCount(0);

  // 7. On the day the worker checks in and out; the subcontractor completes the job and its part.
  await startJobNow(jobId);
  await worker.reload();
  await worker.getByRole("button", { name: "Check in" }).click();
  await expect(worker.getByText(/Checked in /)).toBeVisible();
  await worker.getByRole("button", { name: "Check out" }).click();
  await expect(worker.getByText(/Checked out /)).toBeVisible();
  await sub.goto(jobPath);
  await sub.getByRole("button", { name: "Mark job complete" }).click();
  await expect(sub.getByText(/Marked complete/).first()).toBeVisible();
  // Until the subcontractor reports its part, the prime can't report the project.
  await prime.goto(primePath);
  await expect(prime.getByText(`Wait for ${subName} to report its part complete, or end that subcontract.`)).toBeVisible();
  await sub.goto(subPath);
  await sub.getByLabel("Note for the contractor").fill("All south-face glass done.");
  await sub.getByRole("button", { name: "Report part complete" }).click();
  await expect(sub.getByText(/You reported your part complete/)).toBeVisible();
  await expect(sub.getByRole("link", { name: "Schedule a job" })).toHaveCount(0);

  // 8. The prime reports the project; the customer sees who worked on it and confirms.
  await prime.goto(primePath);
  await expect(prime.getByTestId("subcontract-row")).toContainText("Part complete");
  await prime.getByLabel("Note for the customer").fill("Interior and exterior glass complete.");
  await prime.getByRole("button", { name: "Report work complete" }).click();
  await expect(prime.getByText(/Waiting for .* to confirm/)).toBeVisible();

  await customer.reload();
  await expect(customer.getByTestId("attendance-row")).toContainText("Wendy Worker");
  const history = customer.getByTestId("history-event");
  for (const step of [`${subName} joined as a subcontractor`, `Job scheduled: ${jobTitle} (${subName})`, `${subName} finished its part`]) {
    await expect(history.filter({ hasText: step }).first()).toBeVisible();
  }
  await expect(customer.getByText("$850.00")).toHaveCount(0);
  await customer.getByRole("button", { name: "Confirm completion" }).click();
  await expect(customer.getByText(/Completed and confirmed/)).toBeVisible();

  await sub.reload();
  await expect(sub.getByText(/Completed and confirmed/)).toBeVisible();
  // The subcontractor's history is its own part, never the award price.
  await expect(sub.getByTestId("history-event").filter({ hasText: "Awarded to" })).toHaveCount(0);
});
