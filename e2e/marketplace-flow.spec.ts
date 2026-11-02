import { expect, test, type Page } from "@playwright/test";
import {
  createConfirmedAccount,
  createStaffAccount,
  newYorkDate,
  seedApprovedContractor,
  seedApprovedWorker,
  seedContractorCoverage,
  signIn,
  signUpThroughUi,
  startJobNow,
  uniqueEmail,
} from "./support";

/**
 * The whole marketplace transaction with separate customer, contractor,
 * worker and staff accounts, each in its own browser session:
 *
 * customer signs up and is approved → posts a project → two contractors
 * quote → the customer awards one → the winner schedules a job from the
 * project → a worker applies, is offered it and accepts → on the day the
 * worker checks in and out → the contractor completes the job and reports
 * the project complete → the customer sends it back once, then confirms →
 * every party sees the right status and history, and nobody sees what
 * isn't theirs.
 *
 * Contractor and worker onboarding and approval have their own specs, so
 * those two accounts start approved. The only step not done through the
 * app is moving the job's start time to "now" for the check-in.
 */
test("customer → contractor → worker → confirmed project", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  // Accounts --------------------------------------------------------------------
  const customerEmail = uniqueEmail("flowcustomer");
  const orgName = `Carleton Office Park ${tag}`;
  const winnerOwner = await createConfirmedAccount("Marcus Bell", "flowwinner");
  const winnerName = `Harborline Facility ${tag}`;
  const winnerId = await seedApprovedContractor(winnerOwner.id, winnerName);
  await seedContractorCoverage(winnerId, "commercial-cleaning", "islip");
  const rivalOwner = await createConfirmedAccount("Rita Rival", "flowrival");
  const rivalName = `Rival Cleaning ${tag}`;
  const rivalId = await seedApprovedContractor(rivalOwner.id, rivalName);
  await seedContractorCoverage(rivalId, "commercial-cleaning", "islip");
  const workerAccount = await createConfirmedAccount("Wendy Worker", "flowworker");
  await seedApprovedWorker(workerAccount.id, "islip", "floor-care");
  const staffEmail = await createStaffAccount();

  const customer = await session();
  const contractor = await session();
  const rival = await session();
  const worker = await session();
  const staff = await session();

  // 1. The customer creates an account and an organization; staff approve it.
  await signUpThroughUi(customer, { name: "Priya Manager", email: customerEmail, as: "customer" });
  await customer.getByLabel("Organization name").fill(orgName);
  await customer.getByRole("button", { name: "Register organization" }).click();
  await customer.waitForURL(/\/app\/org\/[0-9a-f-]+\/profile/);
  const customerOrgUrl = customer.url().replace(/\/profile$/, "");
  const customerId = customerOrgUrl.split("/").pop()!;
  await customer.getByLabel("Business phone").fill("631-555-0123");
  await customer.getByLabel("Business email").fill("pm@carleton.example");
  await customer.getByLabel("Primary property or office address").fill("200 Carleton Ave");
  await customer.getByLabel("City or hamlet").fill("Central Islip");
  await customer.getByLabel("ZIP").fill("11722");
  await customer.getByRole("button", { name: "Save profile" }).click();
  await expect(customer.getByText(/saved/i).first()).toBeVisible();
  await customer.goto(customerOrgUrl);
  await customer.getByRole("button", { name: "Submit for review" }).click();
  await expect(customer.getByText(/QuickPro staff are reviewing your organization registration/)).toBeVisible();

  await signIn(staff, staffEmail, `/app/admin/organizations/${customerId}`);
  await staff.getByRole("button", { name: "Approve" }).click();
  await expect(staff.getByText("Approved.", { exact: true })).toBeVisible();

  // 2. The customer posts the project with location, scope, requirements and budget.
  const title = `Lobby floor restoration ${tag}`;
  await customer.goto(`${customerOrgUrl}/requests/new`);
  await customer.getByLabel("Title").fill(title);
  await customer.getByLabel("Service").selectOption({ label: "Commercial cleaning" });
  await customer.getByLabel("Town").selectOption({ label: "Islip" });
  await customer.getByLabel("Scope").fill("Strip, seal and wax 6,000 sq ft of lobby VCT over one night.");
  await customer.getByLabel("Requirements").fill("Crew signs in at the security desk. Work after 6 PM only.");
  await customer.getByLabel("Preferred start").fill(newYorkDate(5));
  await customer.getByLabel("Budget from (USD)").fill("2,000");
  await customer.getByLabel("Budget up to (USD)").fill("4,000");
  await customer.getByLabel("Street address").fill("200 Carleton Ave");
  await customer.getByLabel("City or hamlet").fill("Central Islip");
  await customer.getByLabel("ZIP code").fill("11722");
  await customer.getByLabel("Contact name").fill("Sam Security");
  await customer.getByLabel("Contact phone").fill("631-555-0199");
  await customer.getByRole("button", { name: "Post request" }).click();
  await expect(customer.getByText(/Request posted/)).toBeVisible();
  const requestPath = new URL(customer.url()).pathname;
  const requestId = requestPath.split("/").pop()!;

  // 3. Both contractors discover it and quote. Neither sees the address or the other's price.
  const sendQuote = async (page: Page, email: string, orgId: string, amount: string) => {
    await signIn(page, email, `/app/org/${orgId}/requests`);
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByText("Crew signs in at the security desk.")).toBeVisible();
    await expect(page.getByText("200 Carleton Ave")).toHaveCount(0);
    await page.getByLabel("Total price (USD)").fill(amount);
    await page.getByLabel("What's included").fill("Strip, two coats of sealer, three coats of finish. Crew of two overnight.");
    await page.getByRole("button", { name: "Send quote" }).click();
    await expect(page.getByText("Quote sent to the customer.")).toBeVisible();
  };
  await sendQuote(contractor, winnerOwner.email, winnerId, "3,400");
  await sendQuote(rival, rivalOwner.email, rivalId, "2,900");
  await expect(rival.getByText("$3,400.00")).toHaveCount(0);

  // 4. The customer compares the bids and awards the higher one.
  await customer.reload();
  const quotes = customer.getByTestId("quote");
  await expect(quotes).toHaveCount(2);
  const winning = quotes.filter({ hasText: winnerName });
  await winning.getByText("Accept quote").click();
  await winning.getByRole("button", { name: "Confirm and award" }).click();
  await expect(customer.getByText(/Quote accepted/)).toBeVisible();
  await expect(customer.getByText("No jobs scheduled yet")).toBeVisible();

  // The losing contractor is told and still can't see the site or the project's work.
  await rival.goto(`/app/org/${rivalId}/requests/${requestId}`);
  await expect(rival.getByText(/Your quote wasn.t accepted/)).toBeVisible();
  await expect(rival.getByText("200 Carleton Ave")).toHaveCount(0);
  await expect(rival.getByRole("heading", { name: /^Work \(/ })).toHaveCount(0);

  // 5. The winner receives the project and schedules a job from it, prefilled from the request.
  await contractor.goto(`/app/org/${winnerId}/requests/${requestId}`);
  await expect(contractor.getByText(/accepted your quote of \$3,400.00/)).toBeVisible();
  await expect(contractor.getByText(/200 Carleton Ave/).first()).toBeVisible();
  await contractor.getByRole("link", { name: "Schedule a job" }).click();
  await contractor.waitForURL(/\/jobs\/new\?request=/);
  await expect(contractor.getByLabel("Job title")).toHaveValue(title);
  await expect(contractor.getByLabel("Street address")).toHaveValue("200 Carleton Ave");
  await contractor.getByLabel("Job title").fill(`Overnight strip and wax ${tag}`);
  await contractor.getByText("Floor care (strip, wax, buff)").click();
  await contractor.getByLabel("Start time").fill("18:00");
  await contractor.getByLabel("End time").fill("23:00");
  await contractor.getByLabel("People needed").fill("1");
  await contractor.getByLabel("Hourly pay (USD)").fill("25.00");
  await contractor.getByRole("button", { name: "Schedule job" }).click();
  await contractor.waitForURL(/\/jobs\/[0-9a-f-]+\?posted=1/);
  const jobPath = new URL(contractor.url()).pathname;
  const jobId = jobPath.split("/").pop()!;
  await expect(contractor.getByRole("link", { name: new RegExp(`Project: ${title}`) })).toBeVisible();

  // The customer can't open the contractor's job page, but sees the job on the project.
  expect((await customer.goto(`/app/org/${winnerId}/jobs/${jobId}`))?.status()).toBe(404);
  await customer.goto(requestPath);
  await expect(customer.getByTestId("project-job")).toContainText("0/1 booked");

  // 6. The worker finds the job, applies, gets the offer and accepts.
  const jobTitle = `Overnight strip and wax ${tag}`;
  await signIn(worker, workerAccount.email, "/app/worker/jobs");
  await worker.getByRole("link", { name: new RegExp(jobTitle) }).click();
  await expect(worker.getByText(winnerName)).toBeVisible();
  await expect(worker.getByText(orgName)).toHaveCount(0);
  await expect(worker.getByText("$3,400.00")).toHaveCount(0);
  await worker.getByRole("button", { name: "Apply for this job" }).click();
  await expect(worker.getByText("You applied", { exact: true })).toBeVisible();

  await contractor.goto(jobPath);
  await expect(contractor.getByText("Wendy Worker")).toBeVisible();
  await contractor.getByRole("button", { name: "Offer the job" }).click();
  await expect(contractor.getByText("Offered (1)", { exact: true })).toBeVisible();

  await worker.goto(`/app/worker/jobs/${jobId}`);
  await worker.getByRole("button", { name: "Accept job" }).click();
  await expect(worker.getByText("200 Carleton Ave, Central Islip, NY 11722")).toBeVisible();

  // The worker can't open the customer's project.
  expect((await worker.goto(`/app/org/${customerId}/requests/${requestId}`))?.status()).toBe(404);

  // 7. Contractor and customer coordinate on the project thread.
  await contractor.goto(`/app/org/${winnerId}/requests/${requestId}`);
  await contractor.getByLabel("New message").fill("Crew of one booked for the first night. Which entrance after 6?");
  await contractor.getByRole("button", { name: "Send" }).click();
  await expect(contractor.getByTestId("message")).toContainText("Which entrance after 6?");
  await customer.goto(requestPath);
  await expect(customer.getByTestId("message")).toContainText("Which entrance after 6?");
  await customer.getByLabel("New message").fill("Use the loading dock on the east side.");
  await customer.getByRole("button", { name: "Send" }).click();
  await expect(customer.getByTestId("message").last()).toContainText("loading dock");
  await expect(customer.getByTestId("project-job")).toContainText("1/1 booked");

  // 8. On the day: the worker checks in and out.
  await startJobNow(jobId);
  await worker.goto(`/app/worker/jobs/${jobId}`);
  await worker.getByRole("button", { name: "Check in" }).click();
  await expect(worker.getByText(/Checked in /)).toBeVisible();
  await worker.getByRole("button", { name: "Check out" }).click();
  await expect(worker.getByText(/Checked out /)).toBeVisible();

  // The customer sees the attendance.
  await customer.reload();
  const attendance = customer.getByTestId("attendance-row");
  await expect(attendance).toHaveCount(1);
  await expect(attendance).toContainText("Wendy Worker");
  await expect(attendance).not.toContainText("—");
  await expect(customer.getByText("631-555-0142")).toHaveCount(0);

  // 9. The contractor completes the job and reports the project complete.
  await contractor.goto(jobPath);
  await contractor.getByRole("button", { name: "Mark job complete" }).click();
  await expect(contractor.getByText(/Marked complete/).first()).toBeVisible();
  await contractor.goto(`/app/org/${winnerId}/requests/${requestId}`);
  await contractor.getByLabel("Note for the customer").fill("Lobby stripped, sealed and waxed.");
  await contractor.getByRole("button", { name: "Report work complete" }).click();
  await expect(contractor.getByText(/Waiting for .* to confirm/)).toBeVisible();

  // 10. The customer sends it back once, the contractor re-reports, and the customer confirms.
  await customer.goto(`${customerOrgUrl}`);
  await expect(customer.getByText("Needs your confirmation")).toBeVisible();
  await customer.goto(requestPath);
  await expect(customer.getByText(`${winnerName} reported the work complete`)).toBeVisible();
  await customer.getByText("Not finished yet…").click();
  await customer.getByLabel("What still needs doing").fill("The vestibule by the east door was missed.");
  await customer.getByRole("button", { name: "Send back to contractor" }).click();
  await expect(customer.getByText(/Sent back to the contractor with your note/)).toBeVisible();

  await contractor.reload();
  await expect(contractor.getByText(/sent the work back/)).toBeVisible();
  await expect(contractor.getByText(/vestibule by the east door/).first()).toBeVisible();
  await contractor.getByRole("button", { name: "Report work complete" }).click();
  await expect(contractor.getByText(/Waiting for .* to confirm/)).toBeVisible();

  await customer.reload();
  await customer.getByRole("button", { name: "Confirm completion" }).click();
  await expect(customer.getByText(/Completed and confirmed/)).toBeVisible();

  // 11. Everyone sees the final state and the history.
  const history = customer.getByTestId("history-event");
  await expect(history.first()).toContainText("Customer confirmed the work is complete");
  for (const step of [
    "Request posted",
    `Awarded to ${winnerName} for $3,400.00`,
    `Job scheduled: ${jobTitle}`,
    `Job completed: ${jobTitle}`,
    "Contractor reported the work complete",
    "Customer sent the work back",
  ]) {
    await expect(history.filter({ hasText: step }).first()).toBeVisible();
  }

  await contractor.reload();
  await expect(contractor.getByText(/Completed and confirmed/)).toBeVisible();
  await expect(contractor.getByRole("link", { name: "Schedule a job" })).toHaveCount(0);

  await worker.goto("/app/worker/my-jobs");
  await worker.getByRole("link", { name: new RegExp(jobTitle) }).click();
  await expect(worker.getByText(/Checked out /)).toBeVisible();

  await staff.goto(`/app/admin/requests/${requestId}`);
  await expect(staff.getByText("Completed", { exact: true }).first()).toBeVisible();
  await expect(staff.getByTestId("attendance-row")).toContainText("Wendy Worker");
  await expect(staff.getByTestId("history-event").first()).toContainText("Customer confirmed");

  // The rival still sees only its declined quote.
  await rival.goto(`/app/org/${rivalId}/requests/${requestId}`);
  await expect(rival.getByTestId("history-event")).toHaveCount(0);
  await expect(rival.getByTestId("message")).toHaveCount(0);
});
