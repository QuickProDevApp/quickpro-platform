import { expect, test } from "@playwright/test";
import { createConfirmedAccount, seedApprovedContractor, seedApprovedWorker, seedOpenJob, signIn } from "./support";

test("notifications lead each side to the job, and they message each other there", async ({ browser }, testInfo) => {
  const owner = await createConfirmedAccount("Olivia Owner", "msgowner");
  const orgId = await seedApprovedContractor(owner.id, `Signal Floors ${testInfo.project.name}`);
  const worker = await createConfirmedAccount("Wendy Worker", "msgworker");
  await seedApprovedWorker(worker.id, "islip", "floor-care");
  const title = `Lobby strip and wax ${testInfo.project.name}`;
  const jobId = await seedOpenJob(owner.id, orgId, title);

  const business = await (await browser.newContext({ ...testInfo.project.use })).newPage();
  const crew = await (await browser.newContext({ ...testInfo.project.use })).newPage();

  await signIn(crew, worker.email, `/app/worker/jobs/${jobId}`);
  await crew.getByRole("button", { name: "Apply for this job" }).click();
  await expect(crew.getByText("You applied", { exact: true })).toBeVisible();
  // Applicants are not in the thread yet.
  await expect(crew.getByRole("heading", { name: "Messages" })).toHaveCount(0);

  // The business sees the unread count, opens the notification, and lands on the job.
  await signIn(business, owner.email, "/app");
  await expect(business.getByTestId("notifications-link")).toHaveAccessibleName(/unread/);
  await business.getByTestId("notifications-link").click();
  await business.getByRole("link", { name: new RegExp(`Wendy Worker applied to ${title}`) }).click();
  await business.waitForURL(`**/app/org/${orgId}/jobs/${jobId}`);
  await business.getByRole("button", { name: "Offer the job" }).click();
  await expect(business.getByText("Offered (1)", { exact: true })).toBeVisible();
  await business.getByLabel("New message").fill("Park behind the building, door B.");
  await business.getByRole("button", { name: "Send" }).click();
  await expect(business.getByTestId("message")).toContainText(["Park behind the building, door B."]);
  await expect(business.getByLabel("New message")).toHaveValue("");

  // The worker gets both notifications, follows one, and replies.
  await crew.goto("/app/notifications");
  await expect(crew.getByTestId("notification")).toHaveCount(2);
  await crew.getByRole("link", { name: new RegExp(`New message on ${title}`) }).click();
  await crew.waitForURL(`**/app/worker/jobs/${jobId}`);
  await expect(crew.getByText("Park behind the building, door B.")).toBeVisible();
  await crew.getByLabel("New message").fill("Got it. See you at 7.");
  await crew.getByRole("button", { name: "Send" }).click();
  await expect(crew.getByTestId("message")).toHaveCount(2);
  await crew.getByRole("button", { name: "Accept job" }).click();
  await expect(crew.getByText("On the day", { exact: true })).toBeVisible();

  await business.goto("/app/notifications");
  await expect(business.getByRole("link", { name: /New message on/ })).toContainText("Wendy Worker: Got it. See you at 7.");
  await expect(business.getByRole("link", { name: new RegExp(`Wendy Worker accepted ${title}`) })).toBeVisible();
  await business.getByRole("button", { name: "Mark all read" }).click();
  await expect(business.getByTestId("notifications-link")).toHaveAccessibleName("Notifications");
});
