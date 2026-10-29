import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  createStaffAccount,
  newYorkDate,
  seedApprovedContractor,
  seedApprovedWorker,
  signIn,
} from "./support";

test("a contractor posts a job, a local worker applies, gets the offer and is booked", async ({ browser }, testInfo) => {
  const owner = await createConfirmedAccount("Olivia Owner", "jobowner");
  const business = `Harbor Floors ${testInfo.project.name}`;
  const orgId = await seedApprovedContractor(owner.id, business);
  const worker = await createConfirmedAccount("Wendy Worker", "jobworker");
  await seedApprovedWorker(worker.id, "islip", "floor-care");

  const ownerContext = await browser.newContext({ ...testInfo.project.use });
  const workerContext = await browser.newContext({ ...testInfo.project.use });
  const contractor = await ownerContext.newPage();
  const crew = await workerContext.newPage();

  // The contractor posts a job.
  await signIn(contractor, owner.email, `/app/org/${orgId}/jobs`);
  await contractor.getByRole("link", { name: "Post a job" }).click();
  await contractor.waitForURL(`**/app/org/${orgId}/jobs/new`);
  const title = `Warehouse floor scrub ${testInfo.project.name}`;
  await contractor.getByLabel("Job title").fill(title);
  await contractor.getByLabel("Town").selectOption({ label: "Islip" });
  await contractor.getByLabel("What workers will do").fill("Auto-scrub 12,000 sq ft. Machine provided.");
  await contractor.getByText("Floor care (strip, wax, buff)").click();
  await contractor.getByLabel("Date").fill(newYorkDate(3));
  await contractor.getByLabel("Start time").fill("07:00");
  await contractor.getByLabel("End time").fill("15:00");
  await contractor.getByLabel("People needed").fill("1");
  await contractor.getByLabel("Hourly pay (USD)").fill("16.00");
  await contractor.getByLabel("Street address").fill("100 Carleton Ave");
  await contractor.getByLabel("City or hamlet").fill("Central Islip");
  await contractor.getByLabel("ZIP code").fill("11722");
  await contractor.getByLabel("Ask for").fill("Sam at the dock");
  await contractor.getByLabel("On-site phone").fill("631-555-0177");

  // Below the market's pay floor: refused by the database, form keeps its values.
  await contractor.getByRole("button", { name: "Post job" }).click();
  await expect(contractor.locator("form [role=alert]")).toHaveText(/at least \$17\.00/);
  await contractor.getByLabel("Hourly pay (USD)").fill("24.00");
  await contractor.getByRole("button", { name: "Post job" }).click();
  await contractor.waitForURL(/\/jobs\/[0-9a-f-]+\?posted=1/);
  await expect(contractor.getByText("Job posted.")).toBeVisible();
  const jobUrl = contractor.url().replace(/\?posted=1$/, "");

  // The worker finds it in their towns and applies.
  await signIn(crew, worker.email, "/app/worker/jobs");
  await crew.getByRole("link", { name: new RegExp(title) }).click();
  await expect(crew.getByText(business)).toBeVisible();
  await expect(crew.getByText("100 Carleton Ave")).toHaveCount(0);
  await crew.getByLabel("Note to the business (optional)").fill("I run a ride-on scrubber at my current job.");
  await crew.getByRole("button", { name: "Apply for this job" }).click();
  await expect(crew.getByText("You applied", { exact: true })).toBeVisible();
  await expect(crew.getByRole("button", { name: "Apply for this job" })).toHaveCount(0);

  // The contractor sees the applicant and offers the job.
  await contractor.goto(jobUrl);
  await expect(contractor.getByText("Wendy Worker")).toBeVisible();
  await expect(contractor.getByText("I run a ride-on scrubber")).toBeVisible();
  await contractor.getByRole("button", { name: "Offer the job" }).click();
  await expect(contractor.getByText("Offered (1)", { exact: true })).toBeVisible();

  // The worker accepts and now sees where to go.
  await crew.goto("/app/worker/my-jobs");
  await expect(crew.getByText("You have 1 offer waiting for an answer.")).toBeVisible();
  await crew.getByRole("link", { name: new RegExp(title) }).click();
  await crew.getByRole("button", { name: "Accept job" }).click();
  await expect(crew.getByText("On the day", { exact: true })).toBeVisible();
  await expect(crew.getByText("100 Carleton Ave, Central Islip, NY 11722")).toBeVisible();
  await expect(crew.getByText("Check-in opens an hour before the start time.")).toBeVisible();

  // The contractor sees the booking, the phone number, and the job as filled.
  await contractor.goto(jobUrl);
  await expect(contractor.getByText("Booked (1)")).toBeVisible();
  await expect(contractor.getByRole("link", { name: "631-555-0142" })).toBeVisible();
  await expect(contractor.getByText("Filled", { exact: true }).first()).toBeVisible();

  // The job is no longer listed for other workers.
  await crew.goto("/app/worker/jobs?scope=all");
  await expect(crew.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

  await ownerContext.close();
  await workerContext.close();
});

test("staff see the job and its crew, and outsiders cannot open it", async ({ browser, page }, testInfo) => {
  const owner = await createConfirmedAccount("Second Owner", "jobowner2");
  const orgId = await seedApprovedContractor(owner.id, `Dune Grounds ${testInfo.project.name}`);
  const ownerContext = await browser.newContext({ ...testInfo.project.use });
  const contractor = await ownerContext.newPage();
  await signIn(contractor, owner.email, `/app/org/${orgId}/jobs/new`);
  const title = `Spring cleanup ${testInfo.project.name}`;
  await contractor.getByLabel("Job title").fill(title);
  await contractor.getByLabel("Category").selectOption({ label: "Landscaping" });
  await contractor.getByLabel("Town").selectOption({ label: "Southampton" });
  await contractor.getByLabel("Date").fill(newYorkDate(1));
  await contractor.getByLabel("Start time").fill("08:00");
  await contractor.getByLabel("End time").fill("12:00");
  await contractor.getByLabel("People needed").fill("3");
  await contractor.getByLabel("Hourly pay (USD)").fill("22");
  await contractor.getByLabel("Street address").fill("1 Job Lane");
  await contractor.getByLabel("City or hamlet").fill("Southampton");
  await contractor.getByLabel("ZIP code").fill("11968");
  await contractor.getByLabel("Ask for").fill("Lee");
  await contractor.getByLabel("On-site phone").fill("631-555-0199");
  await contractor.getByRole("button", { name: "Post job" }).click();
  await contractor.waitForURL(/\/jobs\/[0-9a-f-]+\?posted=1/);
  const jobPath = new URL(contractor.url()).pathname;
  const jobId = jobPath.split("/").pop()!;
  await ownerContext.close();

  // A different signed-in user gets 404 for the contractor's job page.
  const stranger = await createConfirmedAccount("Stranger", "stranger");
  await signIn(page, stranger.email);
  expect((await page.goto(jobPath))?.status()).toBe(404);
  expect((await page.goto(`/app/admin/jobs/${jobId}`))?.status()).toBe(404);

  // Staff see it in the unfilled-soon queue.
  const staffEmail = await createStaffAccount();
  const staffContext = await browser.newContext({ ...testInfo.project.use });
  const staff = await staffContext.newPage();
  await signIn(staff, staffEmail, "/app/admin/jobs");
  await staff.getByRole("link", { name: new RegExp(title) }).click();
  await expect(staff.getByText("Match a worker")).toBeVisible();
  await expect(staff.getByText("1 Job Lane, Southampton, NY 11968")).toBeVisible();
  await staffContext.close();
});
