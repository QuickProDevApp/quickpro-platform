import { expect, test } from "@playwright/test";

test("the homepage leads customers, contractors and tradespeople to the right sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find the right crew. Get it done.");

  await page.getByRole("link", { name: "Post a project" }).first().click();
  await expect(page).toHaveURL(/\/sign-up\?as=customer/);
  await expect(page.getByRole("link", { name: "Property owner" })).toHaveAttribute("aria-current", "page");
  await page.goto("/");
  await page.getByRole("link", { name: "Join as a contractor" }).first().click();
  await expect(page).toHaveURL(/\/sign-up\?as=contractor/);
  await page.goto("/");
  await page.getByRole("link", { name: "Find shift work near you" }).click();
  await expect(page).toHaveURL(/\/sign-up\?as=worker/);
  // The role switch on the sign-up page changes where onboarding starts.
  await page.getByRole("link", { name: "Contractor", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up\?as=contractor/);
  await expect(page.getByText("Create your account, then register your business.")).toBeVisible();
});

test("navigation reaches each section and every footer page loads", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByLabel("Menu").click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Find work" }).click();
  await expect(page).toHaveURL(/#workers$/);
  await expect(page.getByRole("heading", { name: "Steady shifts close to home, with the pay up front." })).toBeInViewport();
  if (isMobile) await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "For contractors" })).toBeHidden();

  const footer = page.getByRole("contentinfo");
  const hrefs = await footer.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  for (const href of new Set(hrefs)) {
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);
  }
});

test("the marketplace tabs switch with a click and with the arrow keys", async ({ page }) => {
  await page.goto("/#for-pros");
  const tabs = page.getByRole("tablist", { name: "QuickPro marketplace" });
  await tabs.getByRole("tab", { name: "Subcontractors" }).click();
  await expect(tabs.getByRole("tab", { name: "Subcontractors" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "Subcontractors pick up the work they do best." })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Skilled workers" })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: "Skilled workers" })).toBeFocused();
  await expect(page.getByRole("tabpanel").getByRole("link", { name: "Find shift work" })).toHaveAttribute("href", "/sign-up?as=worker");
});

test("the search and the service cards open the contractor directory, filtered", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("search", { name: "Find a pro" });
  await search.getByLabel("What do you need?").selectOption("carpentry");
  await search.getByLabel("Where?").selectOption("islip");
  await search.getByRole("button", { name: "Find pros" }).click();
  await expect(page).toHaveURL(/\/contractors\?category=carpentry&town=islip$/);
  await expect(page.getByLabel("Service")).toHaveValue("carpentry");
  await expect(page.getByLabel("Town")).toHaveValue("islip");

  await page.goto("/#services");
  await page.locator("#services").getByRole("link", { name: /^Flooring/ }).first().click();
  await expect(page).toHaveURL(/\/contractors\?category=flooring$/);
  await expect(page.getByLabel("Service")).toHaveValue("flooring");
});
