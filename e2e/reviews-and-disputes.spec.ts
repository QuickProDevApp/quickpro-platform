import { expect, test, type Page } from "@playwright/test";
import {
  createConfirmedAccount,
  createStaffAccount,
  seedApprovedContractor,
  seedApprovedCustomer,
  seedApprovedWorker,
  seedAwardedProject,
  seedContractorCoverage,
  seedFinishedProject,
  signIn,
} from "./support";

/** Picks a star rating in the review form by clicking the star, as a person would. */
async function rate(page: Page, stars: number) {
  await page.locator(`label[for$="-rating-${stars}"]`).click();
  await expect(page.getByLabel(new RegExp(`^${stars} stars?:`))).toBeChecked();
}

/**
 * Reviews and disputes after a finished project, with separate customer,
 * contractor, worker and staff accounts, each in its own browser session.
 * The project is finished through the real workflow functions (covered by
 * the marketplace and subcontract specs); everything here goes through the UI.
 *
 * Reviews: the customer and contractor review each other double-blind; the
 * contractor's rating reaches the customer's directory; the contractor
 * replies. The business and the worker review each other's shift; the worker
 * flags an unfair review and staff hide it.
 *
 * Disputes: the customer raises one on the project, the contractor answers
 * on its thread, staff close it with an outcome both sides see. The worker
 * raises one about hours and withdraws it.
 */
test("reviews and disputes between customer, contractor, worker and staff", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const customerOwner = await createConfirmedAccount("Priya Manager", "trustcustomer");
  const customerName = `Carleton Office Park ${tag}`;
  const customerId = await seedApprovedCustomer(customerOwner.id, customerName);
  const contractorOwner = await createConfirmedAccount("Marcus Bell", "trustprime");
  const contractorName = `Harborline Facility ${tag}`;
  const contractorId = await seedApprovedContractor(contractorOwner.id, contractorName);
  await seedContractorCoverage(contractorId, "commercial-cleaning", "islip");
  const workerAccount = await createConfirmedAccount("Wendy Worker", "trustworker");
  await seedApprovedWorker(workerAccount.id, "islip", "floor-care");
  const staffEmail = await createStaffAccount();
  const title = `Office cleaning ${tag}`;
  const requestId = await seedAwardedProject({
    customerOwnerId: customerOwner.id,
    customerId,
    contractorOwnerId: contractorOwner.id,
    contractorId,
    title,
  });
  const { jobId, assignmentId } = await seedFinishedProject({
    requestId,
    customerOwnerId: customerOwner.id,
    contractorOwnerId: contractorOwner.id,
    contractorId,
    workerId: workerAccount.id,
    jobTitle: `Lobby floors ${tag}`,
  });
  const customerPath = `/app/org/${customerId}/requests/${requestId}`;
  const contractorPath = `/app/org/${contractorId}/requests/${requestId}`;

  const customer = await session();
  const contractor = await session();
  const worker = await session();
  const staff = await session();

  // 1. The customer reviews the contractor. The contractor doesn't see it yet.
  await signIn(customer, customerOwner.email, customerPath);
  await expect(customer.getByRole("heading", { name: `Review ${contractorName}` })).toBeVisible();
  await rate(customer, 5);
  await customer.getByLabel("What went well, or what didn't").fill("Floors look new. The crew was on time every night.");
  await customer.getByRole("button", { name: "Submit review" }).click();
  await expect(customer.getByTestId("my-review")).toContainText("Not shared yet");

  await signIn(contractor, contractorOwner.email, contractorPath);
  await expect(contractor.getByRole("heading", { name: `Review ${customerName}` })).toBeVisible();
  await expect(contractor.getByText("Floors look new")).toHaveCount(0);

  // 2. A low rating needs a reason; once the contractor reviews back, both are published.
  await rate(contractor, 2);
  await contractor.getByRole("button", { name: "Submit review" }).click();
  await expect(contractor.getByText("Say briefly what went wrong so the rating is useful.")).toBeVisible();
  await rate(contractor, 4);
  await contractor.getByLabel("What went well, or what didn't").fill("Clear scope and quick answers.");
  await contractor.getByRole("button", { name: "Submit review" }).click();
  await expect(contractor.getByTestId("my-review")).toContainText("Published");
  await expect(contractor.getByTestId("their-review")).toContainText("Floors look new");
  await customer.reload();
  await expect(customer.getByTestId("their-review")).toContainText("Clear scope and quick answers.");

  // 3. The contractor's rating and reply.
  await contractor.goto(`/app/org/${contractorId}/reviews`);
  await expect(contractor.getByTestId("rating").first()).toContainText("5.0");
  await expect(contractor.getByTestId("received-review")).toContainText(customerName);
  await contractor.getByText("Reply publicly…").click();
  await contractor.getByLabel("Your reply").fill("Thank you, it was a pleasure.");
  await contractor.getByRole("button", { name: "Post reply" }).click();
  await expect(contractor.getByTestId("received-review")).toContainText("Your reply: Thank you, it was a pleasure.");
  await customer.goto(`/app/org/${customerId}/contractors`);
  await expect(customer.getByTestId("contractor-row").filter({ hasText: contractorName })).toContainText("5.0");

  // 4. The worker and the business review the shift.
  await signIn(worker, workerAccount.email, `/app/worker/jobs/${jobId}`);
  await expect(worker.getByRole("heading", { name: `Review ${contractorName}` })).toBeVisible();
  await rate(worker, 5);
  await worker.getByRole("button", { name: "Submit review" }).click();
  await expect(worker.getByTestId("my-review")).toContainText("Not shared yet");

  await contractor.goto(`/app/org/${contractorId}/jobs/${jobId}`);
  await contractor.getByRole("link", { name: /Review this shift/ }).click();
  await contractor.waitForURL(new RegExp(`/shifts/${assignmentId}`));
  await rate(contractor, 2);
  await contractor.getByLabel("What went well, or what didn't").fill("Left the buffer plugged in overnight in the lobby.");
  await contractor.getByRole("button", { name: "Submit review" }).click();
  await expect(contractor.getByTestId("their-review")).toBeVisible();

  // 5. The worker flags it; staff hide it, and it stops counting.
  await worker.goto("/app/worker/reviews");
  await expect(worker.getByTestId("received-review")).toContainText("Left the buffer plugged in");
  await expect(worker.getByTestId("rating").first()).toContainText("2.0");
  await worker.getByText("Flag for staff…").click();
  await worker.getByLabel("What's wrong with it").fill("That was another worker's shift, not mine.");
  await worker.getByRole("button", { name: "Send to staff" }).click();
  await expect(worker.getByText("With QuickPro staff")).toBeVisible();

  await signIn(staff, staffEmail, "/app/admin/reviews");
  const flagged = staff.getByTestId("admin-review").filter({ hasText: contractorName });
  await expect(flagged).toContainText("another worker's shift");
  await flagged.getByLabel("Reason for hiding").fill("Wrong worker, confirmed with the business.");
  await flagged.getByRole("button", { name: "Hide review" }).click();
  await expect(staff.getByText("Review hidden.")).toBeVisible();
  await worker.reload();
  await expect(worker.getByTestId("received-review")).toContainText("Hidden by QuickPro staff: Wrong worker");
  await expect(worker.getByText("No reviews yet")).toBeVisible();

  // 6. The customer raises a dispute on the project.
  await customer.goto(customerPath);
  await customer.getByText("Report a problem…").click();
  await customer.getByLabel("What is it about?").selectOption({ label: "Quality of the work" });
  await customer.getByLabel("What happened").fill("The third-floor carpets were missed on Thursday and Friday nights.");
  await customer.getByLabel("What would put it right").fill("A return visit this week.");
  await customer.getByRole("button", { name: "Raise dispute" }).click();
  await customer.waitForURL(/\/disputes\/[0-9a-f-]+\?opened=1/);
  const disputeId = new URL(customer.url()).pathname.split("/").pop()!;
  await expect(customer.getByText(/Dispute raised\./)).toBeVisible();
  await expect(customer.getByTestId("dispute-summary")).toContainText("third-floor carpets");

  // 7. The contractor answers on the dispute's thread.
  await contractor.goto(`/app/org/${contractorId}/disputes`);
  await expect(contractor.getByTestId("dispute-row")).toContainText(`Raised by ${customerName}`);
  await contractor.getByTestId("dispute-row").click();
  await contractor.waitForURL(new RegExp(`/disputes/${disputeId}`));
  await contractor.getByLabel("New message").fill("We'll send a crew back Tuesday night for the third floor.");
  await contractor.getByRole("button", { name: "Send" }).click();
  await expect(contractor.getByTestId("message")).toContainText("Tuesday night");
  // The contractor can't close or withdraw it.
  await expect(contractor.getByText("Withdraw this dispute…")).toHaveCount(0);

  // 8. Staff close it with an outcome; both sides see it, and the project history records it.
  await staff.goto("/app/admin/disputes");
  await staff.getByTestId("dispute-row").filter({ hasText: customerName }).click();
  await staff.waitForURL(new RegExp(`/admin/disputes/${disputeId}`));
  await expect(staff.getByTestId("message")).toContainText("Tuesday night");
  await staff.getByLabel("Outcome").selectOption({ label: "Resolved between the two sides" });
  await staff.getByLabel("What was decided, and why").fill("Return visit agreed for Tuesday; the customer confirmed in the thread.");
  await staff.getByRole("button", { name: "Close dispute" }).click();
  await expect(staff.getByTestId("dispute-resolution")).toContainText("Return visit agreed");
  await customer.reload();
  await expect(customer.getByText("Outcome: Resolved between the two sides")).toBeVisible();
  await expect(customer.getByLabel("New message")).toHaveCount(0);
  await customer.goto(customerPath);
  await expect(customer.getByTestId("work-dispute")).toContainText("Closed");
  await expect(customer.getByText(/Dispute closed by QuickPro staff/)).toBeVisible();

  // 9. The worker raises a dispute about hours, then withdraws it.
  await worker.goto(`/app/worker/jobs/${jobId}`);
  await worker.getByText("Report a problem…").click();
  await worker.getByLabel("What is it about?").selectOption({ label: "Hours or attendance" });
  await worker.getByLabel("What happened").fill("I stayed 30 minutes past check-out to finish the buffing.");
  await worker.getByRole("button", { name: "Raise dispute" }).click();
  await worker.waitForURL(/\/app\/worker\/disputes\/[0-9a-f-]+\?opened=1/);
  await worker.getByText("Withdraw this dispute…").click();
  await worker.getByLabel("Note").fill("Sorted it out with the dispatcher.");
  await worker.getByRole("button", { name: "Withdraw dispute" }).click();
  await expect(worker.getByText(/Withdrawn by you/)).toBeVisible();
  await contractor.goto(`/app/org/${contractorId}/disputes`);
  await expect(contractor.getByTestId("dispute-row").filter({ hasText: "Hours or attendance" })).toContainText("Withdrawn");
});
