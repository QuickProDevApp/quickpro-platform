import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  samplePdf,
  samplePhoto,
  seedApprovedContractor,
  seedApprovedWorker,
  seedBookedShift,
  seedOpenJob,
  signIn,
  startJobNow,
} from "./support";

/**
 * Photo proof: the booked worker can't add photos before checking in; once
 * checked in they add one (with a caption, for a checklist item); the
 * contractor sees it with the worker's name and the file loads; someone
 * outside the job can't open it; the worker takes it off the job.
 */
test("the crew add photos of the work that the contractor can see", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const tag = Math.random().toString(36).slice(2, 7);
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const owner = await createConfirmedAccount("Marcus Bell", "photoprime");
  const orgId = await seedApprovedContractor(owner.id, `Harborline Facility ${tag}`);
  const worker = await createConfirmedAccount(`Wendy Worker ${tag}`, "photoworker");
  await seedApprovedWorker(worker.id, "islip", "floor-care");
  const jobId = await seedOpenJob(owner.id, orgId, `Lobby floors ${tag}`, 2);
  await seedBookedShift(owner.id, worker.id, jobId);

  // The contractor adds a checklist item to attach a photo to.
  const contractor = await session();
  const jobPath = `/app/org/${orgId}/jobs/${jobId}`;
  await signIn(contractor, owner.email, jobPath);
  await expect(contractor.getByText("No photos yet")).toBeVisible();
  await contractor.getByLabel("Add an item").fill("Wax the lobby");
  await contractor.getByRole("button", { name: "Add", exact: true }).click();
  await expect(contractor.getByTestId("checklist-item")).toHaveCount(1);

  // Before check-in, the worker can't add photos.
  const me = await session();
  await signIn(me, worker.email, `/app/worker/jobs/${jobId}`);
  await expect(me.getByText("You can add photos once you've checked in.")).toBeVisible();
  await expect(me.getByLabel("Add a photo")).toHaveCount(0);

  // On the day: check in, then a PDF is refused and a photo goes up.
  await startJobNow(jobId);
  await me.reload();
  await me.getByRole("button", { name: "Check in" }).click();
  await expect(me.getByText(/^Checked in /)).toBeVisible();
  await me.getByLabel("Add a photo").setInputFiles(samplePdf);
  await me.getByRole("button", { name: "Add photo" }).click();
  await expect(me.getByText("Upload a JPEG or PNG photo.")).toBeVisible();
  await me.getByLabel("Add a photo").setInputFiles(samplePhoto);
  await me.getByLabel("Caption (optional)").fill("Lobby after the second coat");
  await me.getByLabel("Checklist item (optional)").selectOption({ label: "Wax the lobby" });
  await me.getByRole("button", { name: "Add photo" }).click();
  const mine = me.getByTestId("job-photo");
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText("Lobby after the second coat");
  await expect(mine).toContainText("For: Wax the lobby");
  await expect(mine).toContainText("You ·");
  await expect.poll(() => mine.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(8);

  // The contractor sees it with the worker's name, and the file is a PNG.
  await contractor.reload();
  const seen = contractor.getByTestId("job-photo");
  await expect(seen).toHaveCount(1);
  await expect(seen).toContainText(`Wendy Worker ${tag} ·`);
  const src = await seen.locator("img").getAttribute("src");
  const file = await contractor.request.get(src!);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("image/png");
  expect(file.headers()["cache-control"]).toContain("private");

  // Someone outside the job can't open it.
  const outsider = await createConfirmedAccount("Olga Outsider", "photooutsider");
  await seedApprovedWorker(outsider.id, "islip", "floor-care");
  const other = await session();
  await signIn(other, outsider.email, "/app/worker");
  expect((await other.request.get(src!)).status()).toBe(404);
  expect((await (await session()).request.get(src!)).status()).not.toBe(200);

  // The worker takes it off the job.
  await me.getByRole("button", { name: "Remove photo: Lobby after the second coat" }).click();
  await expect(me.getByTestId("job-photo")).toHaveCount(0);
  await contractor.reload();
  await expect(contractor.getByText("No photos yet")).toBeVisible();
});
