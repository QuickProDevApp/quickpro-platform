import { expect, test } from "@playwright/test";
import { signUpThroughUi, uniqueEmail } from "./support";

test("a worker builds a profile and submits it for review", async ({ page }) => {
  await signUpThroughUi(page, { name: "Maria Lopez", email: uniqueEmail("worker"), as: "worker" });
  await page.getByRole("button", { name: "Create worker profile" }).click();
  await page.waitForURL("**/app/worker/profile");

  await page.getByLabel("Headline").fill("Floor care tech, 5 years");
  await page.getByLabel("Home town").selectOption({ label: "Brookhaven" });
  await page.getByLabel("How far will you travel? (miles)").fill("20");
  await page.getByLabel("Desired hourly pay ($)").fill("24.50");
  await page.getByText("Floor care (strip, wax, buff)").click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  await page.goto("/app/worker/availability");
  await page.getByLabel("Day").selectOption({ label: "Saturday" });
  await page.getByLabel("From", { exact: true }).fill("07:00");
  await page.getByLabel("To", { exact: true }).fill("15:00");
  await page.getByRole("button", { name: "Add window" }).click();
  await expect(page.getByText("7:00 AM – 3:00 PM")).toBeVisible();

  await page.goto("/app/worker");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("Add a phone number before submitting.");

  await page.goto("/app/account");
  await page.getByLabel("Mobile phone").fill("631-555-0142");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/app/worker");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("QuickPro staff are reviewing your worker profile.")).toBeVisible();
});

test("people cannot reach organizations or staff pages that are not theirs", async ({ page, browser }, testInfo) => {
  await signUpThroughUi(page, { name: "Owner One", email: uniqueEmail("owner"), as: "contractor" });
  await page.getByLabel("Business name").fill("Private Grounds Co");
  await page.getByRole("button", { name: "Register business" }).click();
  await page.waitForURL(/\/app\/org\/[0-9a-f-]+\/profile/);
  const orgUrl = page.url().replace(/\/profile$/, "");

  const otherContext = await browser.newContext({ ...testInfo.project.use });
  const other = await otherContext.newPage();
  await signUpThroughUi(other, { name: "Someone Else", email: uniqueEmail("other") });

  for (const path of [orgUrl, `${orgUrl}/documents`, "/app/admin", "/app/admin/audit"]) {
    const response = await other.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  const download = await other.request.get(`/api/documents/00000000-0000-4000-8000-000000000000`);
  expect(download.status()).toBe(404);
  await otherContext.close();

  // Signed-out visitors are sent to sign in.
  const anonymous = await browser.newContext();
  const anon = await anonymous.newPage();
  await anon.goto(orgUrl);
  await expect(anon).toHaveURL(/\/sign-in\?next=/);
  await anonymous.close();
});
