import { expect, test } from "@playwright/test";
import { createStaffAccount, samplePdf, signIn, signUpThroughUi, uniqueEmail } from "./support";

test("a contractor registers, submits, and is approved by staff", async ({ page, browser }, testInfo) => {
  const email = uniqueEmail("contractor");
  const business = `Bayshore Clean ${email.slice(11, 19)}`;

  await signUpThroughUi(page, { name: "Dana Rivera", email, as: "contractor" });

  // Onboarding: register the business.
  await expect(page.getByRole("heading", { name: "How will you use QuickPro?" })).toBeVisible();
  await page.getByLabel("Business name").fill(business);
  await page.getByRole("button", { name: "Register business" }).click();
  await page.waitForURL(/\/app\/org\/[0-9a-f-]+\/profile/);
  const orgUrl = page.url().replace(/\/profile$/, "");

  // Submitting too early lists what is missing, straight from the database rule.
  await page.goto(orgUrl);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("Add business phone, business email, legal business name");

  // Business profile.
  await page.goto(`${orgUrl}/profile`);
  await page.getByLabel("Legal name").fill(`${business} LLC`);
  await page.getByLabel("Business phone").fill("631-555-0100");
  await page.getByLabel("Business email").fill("ops@bayshore.example");
  await page.getByLabel("Business email").press("Tab");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Business profile saved.")).toBeVisible();

  // Services and areas.
  await page.goto(`${orgUrl}/services`);
  await page.getByText("Commercial cleaning", { exact: true }).click();
  await page.getByText("Islip", { exact: true }).click();
  await page.getByRole("button", { name: "Save services and areas" }).click();
  await expect(page.getByText("Services and areas saved.")).toBeVisible();

  // Insurance certificate. A non-PDF renamed to .pdf is refused.
  await page.goto(`${orgUrl}/documents`);
  await page.getByLabel("Title").fill("Fake certificate");
  await page.getByLabel("File").setInputFiles({ name: "coi.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>nope</html>") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("Upload a PDF, JPEG or PNG file.");

  await page.getByLabel("Title").fill("2026–2027 GL certificate");
  await page.getByLabel("Expiration date").fill("2027-06-30");
  await page.getByLabel("File").setInputFiles(samplePdf);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Document uploaded.")).toBeVisible();
  await expect(page.getByText("Awaiting staff review")).toBeVisible();

  // Submit.
  await page.goto(orgUrl);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("QuickPro staff are reviewing your business registration.")).toBeVisible();
  await expect(page.getByText("In review").first()).toBeVisible();

  // Staff review in a separate session.
  const staffEmail = await createStaffAccount();
  const staffContext = await browser.newContext({ ...testInfo.project.use });
  const staff = await staffContext.newPage();
  await signIn(staff, staffEmail, "/app/admin");
  await expect(staff.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await staff.goto("/app/admin/organizations?status=pending_review");
  await staff.getByRole("link", { name: new RegExp(business) }).click();
  await expect(staff.getByRole("heading", { name: business })).toBeVisible();

  // Approval is refused until staff have reviewed a current insurance certificate.
  await staff.getByRole("button", { name: "Approve" }).click();
  await expect(staff.locator("form [role=alert]")).toContainText("Approve a current general liability certificate");

  await staff.getByLabel("Note").fill("Named insured matches");
  await staff.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(staff.getByText("Reviewed by QuickPro staff")).toBeVisible();

  await staff.getByRole("button", { name: "Request changes" }).click();
  await expect(staff.getByText("Add a note explaining the decision.")).toBeVisible();
  await staff.getByRole("button", { name: "Approve" }).click();
  await expect(staff.getByText("Approved.", { exact: true })).toBeVisible();

  await staff.goto("/app/admin/audit");
  await expect(staff.getByText("organization.status.approved").first()).toBeVisible();
  await staffContext.close();

  // The contractor sees the decision.
  await page.goto(orgUrl);
  await expect(page.getByText("Your business registration is approved by QuickPro staff.")).toBeVisible();
  await expect(page.getByText("Reviewed by staff, not expired")).toBeVisible();
  await page.goto(`${orgUrl}/documents`);
  await expect(page.getByText("Reviewed by QuickPro staff")).toBeVisible();

  // The stored file downloads through the authorized route.
  const href = await page.getByRole("link", { name: "View", exact: true }).first().getAttribute("href");
  const download = await page.request.get(href!);
  expect(download.status()).toBe(200);
  expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Renaming an approved business sends it back to staff review.
  await page.goto(`${orgUrl}/profile`);
  await expect(page.getByText("Changing this sends your registration back to QuickPro staff for review.").first()).toBeVisible();
  await page.getByLabel(/Business name/).fill(`${business} Group`);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Business profile saved.")).toBeVisible();
  await page.goto(orgUrl);
  await expect(page.getByText("went back to QuickPro staff for review")).toContainText("Business name or legal name changed");
});
