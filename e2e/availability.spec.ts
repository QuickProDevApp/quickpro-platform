import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  newYorkDate,
  seedApprovedContractor,
  seedApprovedWorker,
  seedBookedShift,
  seedOpenJob,
  signIn,
} from "./support";

/** Days from today (New York) to the next given weekday at least two days out (0 = Sunday). */
function daysUntil(weekday: number) {
  for (let d = 2; d < 9; d++) {
    if (new Date(`${newYorkDate(d)}T12:00:00Z`).getUTCDay() === weekday) return d;
  }
  throw new Error("unreachable");
}

/**
 * Availability matching (D-037). The worker is available Saturdays 07:00 to
 * 15:00. A Saturday shift is marked as fitting and a Monday one as outside
 * their hours, and the "Fits my availability" filter keeps only the first.
 * The contractor sees the same on the applicant list. Once the worker books
 * another Saturday shift, the first one shows as a clash on both sides.
 */
test("workers and contractors see whether a shift fits the worker's availability", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const tag = Math.random().toString(36).slice(2, 7);
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const owner = await createConfirmedAccount("Marcus Bell", "availprime");
  const orgId = await seedApprovedContractor(owner.id, `Harborline Facility ${tag}`);
  const worker = await createConfirmedAccount(`Wendy Worker ${tag}`, "availworker");
  await seedApprovedWorker(worker.id, "islip", "floor-care");
  const saturday = await seedOpenJob(owner.id, orgId, `Saturday lobby ${tag}`, daysUntil(6));
  const monday = await seedOpenJob(owner.id, orgId, `Monday offices ${tag}`, daysUntil(1));

  // The worker's job list marks each shift.
  const me = await session();
  await signIn(me, worker.email, "/app/worker/jobs?scope=all");
  const row = (title: string) => me.getByRole("listitem").filter({ hasText: title });
  await expect(row(`Saturday lobby ${tag}`).getByTestId("job-fit")).toHaveText("Within your availability");
  await expect(row(`Monday offices ${tag}`).getByTestId("job-fit")).toHaveText("Outside your availability");

  // The filter keeps only shifts that fit.
  await me.getByRole("link", { name: "Fits my availability" }).click();
  await expect(me).toHaveURL(/fit=1/);
  await expect(me).toHaveURL(/scope=all/);
  await expect(row(`Saturday lobby ${tag}`)).toHaveCount(1);
  await expect(row(`Monday offices ${tag}`)).toHaveCount(0);

  // The Monday job says so before applying; the worker applies to both anyway.
  await me.goto(`/app/worker/jobs/${monday}`);
  await expect(me.getByTestId("job-fit")).toContainText("Outside your availability");
  await expect(me.getByTestId("job-fit")).toContainText("You can still apply.");
  await me.getByRole("button", { name: "Apply for this job" }).click();
  await expect(me.getByRole("button", { name: "Apply for this job" })).toHaveCount(0);
  await me.goto(`/app/worker/jobs/${saturday}`);
  await expect(me.getByTestId("job-fit")).toHaveText("Within your availability");
  await me.getByRole("button", { name: "Apply for this job" }).click();
  await expect(me.getByRole("button", { name: "Apply for this job" })).toHaveCount(0);

  // The contractor sees the same on each applicant list.
  const contractor = await session();
  await signIn(contractor, owner.email, `/app/org/${orgId}/jobs/${monday}`);
  await expect(contractor.getByTestId("availability-fit")).toHaveText("Outside their availability");
  await contractor.goto(`/app/org/${orgId}/jobs/${saturday}`);
  await expect(contractor.getByTestId("availability-fit")).toHaveText("Within their availability");

  // The worker books another Saturday shift at the same time: now it's a clash.
  const other = await seedOpenJob(owner.id, orgId, `Saturday garage ${tag}`, daysUntil(6));
  await seedBookedShift(owner.id, worker.id, other);
  await contractor.reload();
  await expect(contractor.getByTestId("availability-fit")).toHaveText("Booked on another job then");
  await me.goto("/app/worker/jobs?scope=all");
  await expect(row(`Saturday lobby ${tag}`).getByTestId("job-fit")).toHaveText("Clashes with a shift you booked");
  await me.goto(`/app/worker/jobs?scope=all&fit=1`);
  await expect(row(`Saturday lobby ${tag}`)).toHaveCount(0);
});
