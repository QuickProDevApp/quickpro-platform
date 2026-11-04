import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  notificationEmailStatus,
  seedApprovedContractor,
  seedApprovedWorker,
  seedOpenJob,
  signIn,
  waitForEmail,
} from "./support";

test("notifications are emailed with a link back to the job, unless the person turns emails off", async ({ browser }, testInfo) => {
  const owner = await createConfirmedAccount("Olivia Owner", "mailowner");
  const orgId = await seedApprovedContractor(owner.id, `Bayside Floors ${testInfo.project.name}`);
  const worker = await createConfirmedAccount("Wendy Worker", "mailworker");
  await seedApprovedWorker(worker.id, "islip", "floor-care");
  const title = `Gym floor recoat ${testInfo.project.name}`;
  const jobId = await seedOpenJob(owner.id, orgId, title);

  const crew = await (await browser.newContext({ ...testInfo.project.use })).newPage();
  const business = await (await browser.newContext({ ...testInfo.project.use })).newPage();

  // The worker turns emails off first.
  await signIn(crew, worker.email, "/app/account");
  await expect(crew.getByTestId("email-notifications")).toHaveAttribute("data-state", "on");
  await crew.getByRole("button", { name: "Turn emails off" }).click();
  await expect(crew.getByText("Emails are off.")).toBeVisible();
  await expect(crew.getByTestId("email-notifications")).toHaveAttribute("data-state", "off");

  // Applying notifies the business, by email too, with a link to the job.
  await crew.goto(`/app/worker/jobs/${jobId}`);
  await crew.getByRole("button", { name: "Apply for this job" }).click();
  await expect(crew.getByText("You applied", { exact: true })).toBeVisible();
  const applied = await waitForEmail(owner.email, `Wendy Worker applied to ${title}`);
  expect(applied.text).toContain("Hi Olivia,");
  const link = applied.text.match(/Open it in QuickPro: (\S+)/)?.[1];
  expect(link).toBe(`http://localhost:3000/app/org/${orgId}/jobs/${jobId}`);
  expect(applied.html).toContain("Turn emails off");

  // The link opens the job for the signed-in business.
  await signIn(business, owner.email, new URL(link!).pathname);
  await business.getByRole("button", { name: "Offer the job" }).click();
  await expect(business.getByText("Offered (1)", { exact: true })).toBeVisible();

  // The worker sees the offer in QuickPro, but no email is queued for them.
  await crew.goto("/app/notifications");
  await expect(crew.getByRole("link", { name: new RegExp(`offered`, "i") })).toBeVisible();
  const mine = await notificationEmailStatus(worker.id);
  expect(mine.length).toBeGreaterThan(0);
  expect(mine.every((n) => n.email_status === "skipped")).toBe(true);
});
