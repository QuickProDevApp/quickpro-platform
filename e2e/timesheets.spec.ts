import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  finishShift,
  seedApprovedContractor,
  seedApprovedWorker,
  seedBookedShift,
  seedOpenJob,
  signIn,
} from "./support";

/** Moves a datetime-local value (YYYY-MM-DDTHH:MM) by some minutes, as wall-clock arithmetic. */
function shiftLocal(value: string, minutes: number) {
  return new Date(new Date(`${value}:00Z`).getTime() + minutes * 60_000).toISOString().slice(0, 16);
}

/**
 * Timesheets (D-038). Two workers finish a shift. The contractor approves
 * one as recorded and adjusts the other (a note is required), exports the
 * week as CSV; the worker sees approved hours and an estimate of gross pay,
 * questions them, and the contractor approves again.
 */
test("a contractor approves hours, the worker questions them, and the contractor corrects them", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const tag = Math.random().toString(36).slice(2, 7);
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const owner = await createConfirmedAccount("Marcus Bell", "tsprime");
  const orgId = await seedApprovedContractor(owner.id, `Harborline Facility ${tag}`);
  const wendy = await createConfirmedAccount(`Wendy Worker ${tag}`, "tswendy");
  const omar = await createConfirmedAccount(`Omar Other ${tag}`, "tsomar");
  for (const w of [wendy, omar]) await seedApprovedWorker(w.id, "islip", "floor-care");
  const jobTitle = `Lobby floors ${tag}`;
  const jobId = await seedOpenJob(owner.id, orgId, jobTitle, 2);
  // A second spot, so both can be booked.
  const jobId2 = await seedOpenJob(owner.id, orgId, `Garage sweep ${tag}`, 3);
  const wendyShift = await seedBookedShift(owner.id, wendy.id, jobId);
  const omarShift = await seedBookedShift(owner.id, omar.id, jobId2);
  // 8 hours scheduled; Wendy on time, Omar in 15 minutes late.
  await finishShift(jobId, wendyShift);
  await finishShift(jobId2, omarShift, { startedMinutesAgo: 540, inLate: 15 });

  // The worker sees the shift waiting for approval.
  const me = await session();
  await signIn(me, wendy.email, "/app/worker/timesheets");
  const myRow = me.getByTestId("timesheet-row");
  await expect(myRow).toHaveAttribute("data-status", "pending");
  await expect(myRow).toContainText("Waiting for the business to approve your hours.");

  // The contractor sees both, needing approval.
  const contractor = await session();
  await signIn(contractor, owner.email, `/app/org/${orgId}/timesheets`);
  const rows = contractor.getByTestId("timesheet-row");
  await expect(rows).toHaveCount(2);
  await expect(contractor.getByText("To approve")).toBeVisible();
  const wendyRow = rows.filter({ hasText: `Wendy Worker ${tag}` });
  const omarRow = rows.filter({ hasText: `Omar Other ${tag}` });

  // Approve Wendy's 8 hours as recorded.
  await wendyRow.getByRole("button", { name: "Approve 8 h as recorded" }).click();
  await expect(wendyRow).toHaveAttribute("data-status", "approved");
  await expect(wendyRow.getByTestId("timesheet-approved")).toContainText("8 h");
  await expect(wendyRow.getByTestId("timesheet-approved")).toContainText("≈ $192.00");

  // Adjust Omar's: changing the start needs a note.
  await omarRow.getByText("Adjust and approve…").click();
  // Back to the scheduled start, 15 minutes before he checked in.
  await omarRow.getByLabel("Start").fill(shiftLocal(await omarRow.getByLabel("Start").inputValue(), -15));
  await omarRow.getByLabel("Unpaid break (min)").fill("30");
  await omarRow.getByRole("button", { name: "Approve hours" }).click();
  await expect(omarRow.getByText(/Add a note for the worker/)).toBeVisible();
  await omarRow.getByLabel("Note for the worker").fill("Started at the top of the hour per the supervisor.");
  await omarRow.getByRole("button", { name: "Approve hours" }).click();
  await expect(omarRow).toHaveAttribute("data-status", "approved");
  await expect(omarRow).toContainText("30 min break");

  // The export has both approved rows.
  const csv = await contractor.request.get(`/app/org/${orgId}/timesheets/export`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.split("\r\n")[0]).toBe("date,worker,job,start,end,break_minutes,hours,rate_usd,gross_usd,note");
  expect(text).toContain(`Wendy Worker ${tag},${jobTitle}`);
  expect(text).toContain("8.00,24.00,192.00");
  expect(text).toContain("Started at the top of the hour per the supervisor.");
  // Another business's members can't export it.
  const outsider = await session();
  const stranger = await createConfirmedAccount("Rita Rival", "tsrival");
  await seedApprovedContractor(stranger.id, `Rival ${tag}`);
  await signIn(outsider, stranger.email, "/app");
  expect((await outsider.request.get(`/app/org/${orgId}/timesheets/export`)).status()).toBe(404);

  // Wendy sees the approved hours and estimate, and questions them.
  await me.reload();
  await expect(myRow).toHaveAttribute("data-status", "approved");
  await expect(myRow.getByTestId("timesheet-approved")).toContainText("≈ $192.00");
  await me.getByText("Question these hours…").click();
  await me.getByLabel("What's wrong").fill("I stayed 30 minutes late to finish the buffing.");
  await me.getByRole("button", { name: "Send to the business" }).click();
  await expect(myRow).toHaveAttribute("data-status", "queried");

  // The contractor sees the question and approves again with the extra time.
  await contractor.reload();
  await expect(wendyRow).toHaveAttribute("data-status", "queried");
  await expect(wendyRow).toContainText("I stayed 30 minutes late to finish the buffing.");
  await wendyRow.getByLabel("End").fill(shiftLocal(await wendyRow.getByLabel("End").inputValue(), 30));
  await wendyRow.getByLabel("Note for the worker").fill("Added the 30 minutes you stayed late.");
  await wendyRow.getByRole("button", { name: "Approve hours" }).click();
  await expect(wendyRow).toHaveAttribute("data-status", "approved");
  await expect(wendyRow.getByTestId("timesheet-approved")).toContainText("8.5 h");
  await me.reload();
  await expect(myRow.getByTestId("timesheet-approved")).toContainText("≈ $204.00");
  await expect(myRow).toContainText("Added the 30 minutes you stayed late.");
});
