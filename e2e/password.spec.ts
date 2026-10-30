import { expect, test } from "@playwright/test";
import { createConfirmedAccount, latestEmailLink, PASSWORD, signIn } from "./support";

test("someone who forgot their password resets it from the email link", async ({ page }) => {
  const account = await createConfirmedAccount("Rita Reset", "pwreset");

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await page.getByLabel("Email").fill(account.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/has a QuickPro account, we sent it a link/)).toBeVisible();

  // Without the email link, the reset page refuses.
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();

  await page.goto(await latestEmailLink(account.email, "/auth/v1/verify"));
  await page.waitForURL("**/reset-password");
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await page.getByLabel("Repeat the new password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL("**/app/account?password=reset");
  await expect(page.getByText("Your new password is saved.")).toBeVisible();

  // The old password no longer works; the new one does.
  const fresh = await page.context().browser()!.newContext();
  const other = await fresh.newPage();
  await other.goto(`${page.url().split("/app")[0]}/sign-in`);
  await other.getByLabel("Email").fill(account.email);
  await other.getByLabel("Password").fill(PASSWORD);
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.locator("form [role=alert]")).toBeVisible();
  await other.getByLabel("Password").fill("a-brand-new-password");
  await other.getByRole("button", { name: "Sign in" }).click();
  await other.waitForURL(/\/app/);
});

test("a signed-in user changes their password on the account page", async ({ page }) => {
  const account = await createConfirmedAccount("Cal Change", "pwchange");
  await signIn(page, account.email, "/app/account");
  await page.getByLabel("Current password").fill("not-my-password");
  await page.getByLabel("New password", { exact: true }).fill("another-good-password");
  await page.getByLabel("Repeat the new password").fill("another-good-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("That isn't your current password.")).toBeVisible();

  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();
});
