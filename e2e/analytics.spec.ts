import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  createStaffAccount,
  seedApprovedContractor,
  seedApprovedCustomer,
  seedApprovedWorker,
  seedAwardedProject,
  seedContractorCoverage,
  seedFinishedProject,
  seedOpenRequest,
  signIn,
} from "./support";

/**
 * Staff market analytics. Other specs run against the same database at the
 * same time, so this checks what this spec's own activity guarantees: a
 * finished, staffed project shows in the charts and breakdowns, and a
 * landscaping request on Shelter Island, which no contractor covers, shows
 * as a coverage gap. Then the filters, the CSV export, and that the page is
 * staff only.
 */
test("staff see market analytics, filter them and download a CSV", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const tag = `${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
  const session = async () => (await browser.newContext({ ...testInfo.project.use, acceptDownloads: true })).newPage();

  const customerOwner = await createConfirmedAccount("Priya Manager", "statscustomer");
  const customerId = await seedApprovedCustomer(customerOwner.id, `Carleton Office Park ${tag}`);
  const contractorOwner = await createConfirmedAccount("Marcus Bell", "statsprime");
  const contractorId = await seedApprovedContractor(contractorOwner.id, `Harborline Facility ${tag}`);
  await seedContractorCoverage(contractorId, "commercial-cleaning", "islip");
  const worker = await createConfirmedAccount("Wendy Worker", "statsworker");
  await seedApprovedWorker(worker.id, "islip", "floor-care");
  const requestId = await seedAwardedProject({
    customerOwnerId: customerOwner.id,
    customerId,
    contractorOwnerId: contractorOwner.id,
    contractorId,
    title: `Office cleaning ${tag}`,
  });
  await seedFinishedProject({
    requestId,
    customerOwnerId: customerOwner.id,
    contractorOwnerId: contractorOwner.id,
    contractorId,
    workerId: worker.id,
    jobTitle: `Lobby floors ${tag}`,
  });
  await seedOpenRequest({
    customerOwnerId: customerOwner.id,
    customerId,
    title: `Grounds cleanup ${tag}`,
    category: "landscaping",
    town: "shelter-island",
  });

  const staff = await session();
  await signIn(staff, await createStaffAccount(), "/app/admin");
  await staff.getByRole("link", { name: "Analytics", exact: true }).first().click();
  await staff.waitForURL(/\/app\/admin\/analytics$/);
  await expect(staff.getByRole("heading", { name: "Market analytics" })).toBeVisible();
  await expect(staff.getByText("Suffolk County · All categories · last 30 days")).toBeVisible();

  // Headline numbers and the sections are live counts, so at least this spec's activity.
  const kpis = staff.getByTestId("analytics-kpis");
  await expect(kpis).toContainText("Projects posted");
  await expect(kpis).toContainText("Shift fill rate");
  await expect(staff.getByTestId("analytics-shifts")).toContainText("Positions filled");

  // The shift chart has a column with this spec's filled position; its tooltip says so.
  const filledColumn = staff.getByTestId("activity-column").filter({ has: staff.locator("span.bg-brand") }).first();
  await expect(filledColumn).toBeVisible();
  await filledColumn.focus();
  await expect(staff.getByRole("tooltip")).toContainText(/\d+ filled of \d+/);
  await staff.getByText("Show as a table").first().click();
  await expect(staff.getByRole("cell", { name: /^Week of / }).first()).toBeVisible();

  // The coverage gap and the town with no contractor.
  await expect(staff.getByTestId("coverage-gap").filter({ hasText: "Landscaping in Shelter Island" })).toContainText(/unquoted/);
  await expect(staff.getByTestId("town-row").filter({ hasText: "Shelter Island" }).filter({ visible: true })).toContainText("No contractor");

  // Filters keep each other.
  await staff.getByRole("link", { name: "90 days" }).click();
  await staff.waitForURL(/days=90/);
  await staff.getByRole("link", { name: "Landscaping", exact: true }).click();
  await staff.waitForURL(/days=90.*category=landscaping|category=landscaping.*days=90/);
  await expect(staff.getByText("Suffolk County · Landscaping · last 90 days")).toBeVisible();
  await expect(staff.getByTestId("coverage-gap").filter({ hasText: "Landscaping in Shelter Island" })).toBeVisible();
  await expect(staff.getByTestId("coverage-gap").filter({ hasText: "Commercial cleaning" })).toHaveCount(0);
  await staff.getByRole("link", { name: "12 months" }).click();
  await expect(staff.getByText("Suffolk County · Landscaping · last 12 months")).toBeVisible();
  await expect(staff.getByRole("link", { name: "Landscaping", exact: true })).toHaveAttribute("aria-current", "page");

  // The CSV has the same breakdowns.
  const [download] = await Promise.all([staff.waitForEvent("download"), staff.getByRole("link", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^quickpro-suffolk-county-ny-landscaping-365d-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile(await download.path(), "utf8");
  const lines = csv.trim().split("\r\n");
  expect(lines[0]).toBe(
    "breakdown,name,projects_posted,projects_quoted,awarded_usd,shift_positions,positions_filled,fill_rate_pct,approved_contractors,approved_workers",
  );
  expect(lines[1]).toMatch(/^market,Suffolk County,[1-9]\d*,/);
  expect(lines.find((l) => l.startsWith("town,Shelter Island,"))).toMatch(/^town,Shelter Island,[1-9]\d*,\d+,,\d+,\d+,[\d.]*,0,\d+$/);

  // Not for anyone else.
  const customer = await session();
  await signIn(customer, customerOwner.email, "/app");
  const page = await customer.goto("/app/admin/analytics");
  expect(page?.status()).toBe(404);
  const exported = await customer.request.get("/app/admin/analytics/export?days=30");
  expect(exported.status()).toBe(404);
});
