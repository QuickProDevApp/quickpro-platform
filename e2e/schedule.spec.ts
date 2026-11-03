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

/** The Sunday that starts the week containing a New York date. */
const sundayOf = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
};

/**
 * Week schedules: the contractor sees each job with its crew and which
 * jobs still need people, and moves between weeks; the booked worker sees
 * the shift with their usual availability and downloads a calendar file.
 */
test("contractors and workers see the week's jobs and shifts", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const tag = Math.random().toString(36).slice(2, 7);
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const owner = await createConfirmedAccount("Marcus Bell", "scheduleprime");
  const orgId = await seedApprovedContractor(owner.id, `Harborline Facility ${tag}`);
  const worker = await createConfirmedAccount(`Wendy Worker ${tag}`, "scheduleworker");
  await seedApprovedWorker(worker.id, "islip", "floor-care");
  const day = newYorkDate(3);
  const bookedTitle = `Lobby floors ${tag}`;
  const openTitle = `Window cleaning ${tag}`;
  const bookedJob = await seedOpenJob(owner.id, orgId, bookedTitle, 3);
  await seedOpenJob(owner.id, orgId, openTitle, 3);
  await seedBookedShift(owner.id, worker.id, bookedJob);
  const weekStart = sundayOf(day);

  // 1. The contractor's week.
  const contractor = await session();
  await signIn(contractor, owner.email, `/app/org/${orgId}/jobs`);
  await contractor.getByRole("link", { name: "Schedule", exact: true }).click();
  await contractor.waitForURL(/\/schedule$/);
  await contractor.goto(`/app/org/${orgId}/schedule?week=${day}`);
  const jobDay = contractor.locator(`[data-testid="schedule-day"][data-date="${day}"]`);
  const booked = jobDay.getByTestId("schedule-job").filter({ hasText: bookedTitle });
  await expect(booked).toContainText("1/1 booked");
  await expect(booked).toContainText(`Wendy Worker ${tag}`);
  await expect(booked).toContainText("7:00 AM – 3:00 PM");
  const open = jobDay.getByTestId("schedule-job").filter({ hasText: openTitle });
  await expect(open).toContainText("0/1 booked · needs crew");
  await expect(contractor.getByText("Still to staff")).toBeVisible();

  // Between weeks; the week is in the address.
  const label = await contractor.getByTestId("week-label").innerText();
  await contractor.getByRole("link", { name: "Next week" }).click();
  await contractor.waitForURL(/week=\d{4}-\d{2}-\d{2}/);
  await expect(contractor.getByTestId("week-label")).not.toHaveText(label);
  await expect(contractor.getByTestId("schedule-job").filter({ hasText: tag })).toHaveCount(0);
  await contractor.getByRole("link", { name: "Previous week" }).click();
  await expect(contractor.getByTestId("week-label")).toHaveText(label);
  expect(new URL(contractor.url()).searchParams.get("week")).toBe(weekStart);

  // A job opens its page.
  await open.click();
  await expect(contractor.getByRole("heading", { name: openTitle })).toBeVisible();

  // 2. The worker's week: the booked shift, not the job they weren't offered, and their Saturday availability.
  const me = await session();
  await signIn(me, worker.email, `/app/worker/schedule?week=${day}`);
  const shift = me.locator(`[data-testid="schedule-day"][data-date="${day}"]`).getByTestId("schedule-shift");
  await expect(shift).toHaveCount(1);
  await expect(shift).toContainText(bookedTitle);
  await expect(shift).toContainText("Booked");
  await expect(me.getByTestId("schedule-shift").filter({ hasText: openTitle })).toHaveCount(0);
  const saturday = me.locator('[data-testid="schedule-day"]').last();
  await expect(saturday.getByTestId("availability-note")).toHaveText("Available 7:00 AM – 3:00 PM");

  // The calendar file has the shift and its site.
  const [download] = await Promise.all([
    me.waitForEvent("download"),
    me.getByRole("link", { name: "Download booked shifts (.ics)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("quickpro-shifts.ics");
  const ics = await (
    await download.createReadStream()
  )
    .toArray()
    .then((chunks) => Buffer.concat(chunks).toString("utf8"));
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain(`SUMMARY:${bookedTitle} (Harborline Facility ${tag})`);
  expect(ics).toContain("LOCATION:100 Carleton Ave\\, Central Islip 11722");
  expect(ics).not.toContain(openTitle);

  // Signed out, there's no file.
  const anon = await session();
  const response = await anon.request.get("/app/worker/schedule/calendar.ics");
  expect(await response.text()).not.toContain("BEGIN:VCALENDAR");
});
