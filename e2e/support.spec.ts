import { expect, test } from "@playwright/test";
import { createConfirmedAccount, createStaffAccount, seedApprovedContractor, seedApprovedWorker, signIn } from "./support";

/**
 * Support requests: a contractor asks for help about their business, staff
 * add an internal note and reply, the contractor answers, staff resolve it.
 * A worker reports a safety problem, which comes in urgent. Each person has
 * their own browser session; nobody else can open someone's request.
 */
test("support requests between a contractor, a worker and staff", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const owner = await createConfirmedAccount("Marcus Bell", "helpprime");
  const contractorName = `Harborline Facility ${tag}`;
  await seedApprovedContractor(owner.id, contractorName);
  const workerAccount = await createConfirmedAccount("Wendy Worker", "helpworker");
  await seedApprovedWorker(workerAccount.id, "islip", "floor-care");
  const staffEmail = await createStaffAccount();
  const subject = `Insurance certificate rejected ${tag}`;

  // 1. The contractor asks, about their business.
  const contractor = await session();
  await signIn(contractor, owner.email, "/app/support");
  await expect(contractor.getByRole("heading", { name: "Help and support" })).toBeVisible();
  await expect(contractor.getByText("If someone is hurt or in danger, call 911 first.")).toBeVisible();
  await contractor.getByRole("button", { name: "Send to QuickPro support" }).click();
  await expect(contractor.getByText("Choose what it's about.")).toBeVisible();
  await contractor.getByLabel("What is it about?").selectOption({ label: "Verification and documents" });
  await expect(contractor.getByLabel("Which business?")).toHaveValue(/[0-9a-f-]{36}/);
  await contractor.getByLabel("Subject").fill(subject);
  await contractor.getByLabel("What's going on?").fill("Our general liability certificate was rejected but it runs to next June.");
  await contractor.getByRole("button", { name: "Send to QuickPro support" }).click();
  await contractor.waitForURL(/\/app\/support\/[0-9a-f-]+\?sent=1/);
  const ticketPath = new URL(contractor.url()).pathname;
  await expect(contractor.getByText(/Request sent\./)).toBeVisible();
  await expect(contractor.getByText("With QuickPro")).toBeVisible();
  await expect(contractor.getByText(new RegExp(`Request #\\d+ · Verification and documents · ${contractorName}`))).toBeVisible();

  // 2. Staff find it, add an internal note, and reply.
  const staff = await session();
  await signIn(staff, staffEmail, "/app/admin/support");
  const row = staff.getByTestId("support-row").filter({ hasText: subject });
  await expect(row).toContainText(contractorName);
  await row.click();
  await staff.waitForURL(/\/app\/admin\/support\/[0-9a-f-]+$/);
  await expect(staff.getByTestId("support-requester")).toHaveText("Marcus Bell");
  await staff.getByLabel("Reply", { exact: true }).fill("Reviewer misread the expiry; it's valid to June. Re-review needed.");
  await staff.getByText("Internal note: only QuickPro staff will see it").click();
  await staff.getByRole("button", { name: "Send" }).click();
  await expect(staff.getByText("Internal note added.")).toBeVisible();
  await expect(staff.getByTestId("internal-note")).toContainText("Reviewer misread the expiry");
  await staff.getByLabel("Reply", { exact: true }).fill("Thanks for flagging this. Please upload the certificate again and we'll re-review it today.");
  // The box clears after each message, so a reply is never an accidental note (or the other way round).
  await expect(staff.getByLabel(/Internal note/)).not.toBeChecked();
  await staff.getByRole("button", { name: "Send" }).click();
  await expect(staff.getByText("Reply sent.")).toBeVisible();
  await staff.reload();
  await expect(staff.getByText("Waiting on requester").first()).toBeVisible();

  // 3. The contractor sees the reply, not the note, and answers.
  await contractor.goto(ticketPath);
  await expect(contractor.getByText("Waiting on you", { exact: true })).toBeVisible();
  await expect(contractor.getByTestId("support-message").filter({ hasText: "QuickPro support" })).toContainText("upload the certificate again");
  await expect(contractor.getByText("Reviewer misread the expiry")).toHaveCount(0);
  await expect(contractor.getByTestId("internal-note")).toHaveCount(0);
  await contractor.getByLabel("Your reply").fill("Uploaded it again just now.");
  await contractor.getByRole("button", { name: "Send" }).click();
  await expect(contractor.getByText("Sent to QuickPro support.")).toBeVisible();
  await expect(contractor.getByTestId("support-message").filter({ hasText: "Uploaded it again" })).toBeVisible();

  // 4. Staff resolve it, raise the priority and take it; the contractor sees it resolved and can still reopen.
  await staff.reload();
  await expect(staff.getByText("Needs a reply").first()).toBeVisible();
  await staff.getByLabel("Status").selectOption({ label: "Resolved" });
  await staff.getByLabel("Priority").selectOption({ label: "High" });
  const me = (await staff.getByLabel("Assigned to").locator("option", { hasText: /^You / }).textContent())!;
  await staff.getByLabel("Assigned to").selectOption({ label: me });
  await staff.getByRole("button", { name: "Save" }).click();
  await expect(staff.getByText("Saved.")).toBeVisible();
  await contractor.reload();
  await expect(contractor.getByText("Resolved", { exact: true }).first()).toBeVisible();
  await expect(contractor.getByLabel("Reply to reopen this request")).toBeVisible();
  await contractor.goto("/app/notifications");
  await expect(contractor.getByText(new RegExp(`Resolved: #\\d+ ${subject}`))).toBeVisible();

  // 5. A worker reports a safety problem; it comes in urgent. They can't open the contractor's request.
  const worker = await session();
  await signIn(worker, workerAccount.email, "/app/support");
  await expect(worker.getByLabel("Which business?")).toHaveCount(0);
  await worker.getByLabel("What is it about?").selectOption({ label: "Safety on a job" });
  await worker.getByLabel("Subject").fill(`Cracked ladder rail ${tag}`);
  await worker.getByLabel("What's going on?").fill("The ladder in the Islip storeroom has a cracked rail. I didn't use it.");
  await worker.getByRole("button", { name: "Send to QuickPro support" }).click();
  await worker.waitForURL(/\/app\/support\/[0-9a-f-]+\?sent=1/);
  await worker.goto("/app/support");
  await expect(worker.getByTestId("support-row")).toHaveCount(1);
  const response = await worker.goto(ticketPath);
  expect(response?.status()).toBe(404);

  await staff.goto("/app/admin/support");
  await expect(staff.getByTestId("support-row").filter({ hasText: `Cracked ladder rail ${tag}` })).toContainText("Urgent");
  await staff.goto("/app/admin");
  await expect(staff.getByRole("link", { name: /Support requests waiting on staff/ })).toBeVisible();
});
