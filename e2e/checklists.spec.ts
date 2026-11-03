import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  seedApprovedContractor,
  seedApprovedWorker,
  seedBookedShift,
  seedOpenJob,
  signIn,
  startJobNow,
} from "./support";

/**
 * Job checklists: the contractor builds the list on the job page; the booked
 * worker sees it, can't tick anything before checking in, checks in on the
 * day and ticks items off (one with a note); the contractor sees who did each.
 */
test("a contractor's checklist is checked off by the crew on the day", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const tag = Math.random().toString(36).slice(2, 7);
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const owner = await createConfirmedAccount("Marcus Bell", "checkprime");
  const orgId = await seedApprovedContractor(owner.id, `Harborline Facility ${tag}`);
  const worker = await createConfirmedAccount(`Wendy Worker ${tag}`, "checkworker");
  await seedApprovedWorker(worker.id, "islip", "floor-care");
  const title = `Lobby floors ${tag}`;
  const jobId = await seedOpenJob(owner.id, orgId, title, 2);
  await seedBookedShift(owner.id, worker.id, jobId);

  // 1. The contractor builds the checklist.
  const contractor = await session();
  const jobPath = `/app/org/${orgId}/jobs/${jobId}`;
  await signIn(contractor, owner.email, jobPath);
  await expect(contractor.getByText("No checklist yet")).toBeVisible();
  const add = async (label: string) => {
    await contractor.getByLabel("Add an item").fill(label);
    await contractor.getByRole("button", { name: "Add", exact: true }).click();
    await expect(contractor.getByTestId("checklist-item").filter({ hasText: label })).toBeVisible();
    await expect(contractor.getByLabel("Add an item")).toHaveValue("");
  };
  await add("Strip and wax the lobby");
  await add("Clean the loading dock");
  await add("Replace entrance mats");
  await contractor.getByRole("button", { name: "Remove: Clean the loading dock" }).click();
  await expect(contractor.getByTestId("checklist-item")).toHaveCount(2);
  await expect(contractor.getByTestId("checklist-progress")).toHaveText("0 of 2 done");

  // 2. The worker sees it but can't tick before checking in.
  const me = await session();
  await signIn(me, worker.email, `/app/worker/jobs/${jobId}`);
  await expect(me.getByTestId("checklist-item")).toHaveCount(2);
  await expect(me.getByText("You can check items off once you've checked in.")).toBeVisible();
  await expect(me.getByRole("button", { name: /^Mark done:/ })).toHaveCount(0);

  // 3. On the day: check in, tick one item, and the other with a note.
  await startJobNow(jobId);
  await me.reload();
  await me.getByRole("button", { name: "Check in" }).click();
  await expect(me.getByText(/^Checked in /)).toBeVisible();
  await me.getByRole("button", { name: "Mark done: Strip and wax the lobby" }).click();
  await expect(me.getByTestId("checklist-item").filter({ hasText: "Strip and wax the lobby" })).toHaveAttribute(
    "data-done",
    "true",
  );
  const mats = me.getByTestId("checklist-item").filter({ hasText: "Replace entrance mats" });
  await mats.getByText("Done, with a note").click();
  await mats.getByLabel("Note for Replace entrance mats").fill("Two mats replaced, one was torn");
  await mats.getByRole("button", { name: "Mark done", exact: true }).click();
  await expect(mats).toHaveAttribute("data-done", "true");
  await expect(mats).toContainText("Done by you");
  await expect(me.getByTestId("checklist-progress")).toHaveText("2 of 2 done");

  // Undo works too.
  await me.getByRole("button", { name: "Mark not done: Strip and wax the lobby" }).click();
  await expect(me.getByTestId("checklist-progress")).toHaveText("1 of 2 done");
  await me.getByRole("button", { name: "Mark done: Strip and wax the lobby" }).click();
  await expect(me.getByTestId("checklist-progress")).toHaveText("2 of 2 done");

  // 4. The contractor sees who did what, and was told the checklist is done.
  await contractor.reload();
  await expect(contractor.getByTestId("checklist-progress")).toHaveText("2 of 2 done");
  const done = contractor.getByTestId("checklist-item").filter({ hasText: "Replace entrance mats" });
  await expect(done).toContainText(`Done by Wendy Worker ${tag}`);
  await expect(done).toContainText("Two mats replaced, one was torn");
  await contractor.goto("/app/notifications");
  await expect(contractor.getByText(`Checklist complete: ${title}`)).toBeVisible();
});
