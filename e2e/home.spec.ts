import { expect, test } from "@playwright/test";

test("the homepage leads businesses, workers and customers to the right sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The right people. The right jobs. One platform.");

  await page.getByRole("link", { name: "Find Workers" }).first().click();
  await expect(page).toHaveURL(/\/sign-up\?as=contractor/);
  await page.goto("/");
  await page.getByRole("link", { name: "Find Work", exact: true }).first().click();
  await expect(page).toHaveURL(/\/sign-up\?as=worker/);
  await page.goto("/");
  await page.getByRole("link", { name: "Request quotes from approved contractors" }).click();
  await expect(page).toHaveURL(/\/sign-up\?as=customer/);
});

test("navigation reaches each section and every footer page loads", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByLabel("Menu").click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "For workers" }).click();
  await expect(page).toHaveURL(/#workers$/);
  await expect(page.getByRole("heading", { name: "Good shifts close to home, with the pay up front." })).toBeInViewport();
  if (isMobile) await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Features" })).toBeHidden();

  const footer = page.getByRole("contentinfo");
  const hrefs = await footer.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  for (const href of new Set(hrefs)) {
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);
  }
});

test("feature tabs switch with a click and with the arrow keys", async ({ page }) => {
  await page.goto("/#features");
  const tabs = page.getByRole("tablist", { name: "QuickPro features" });
  await tabs.getByRole("tab", { name: /Messaging/ }).click();
  await expect(tabs.getByRole("tab", { name: /Messaging/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").getByRole("img")).toHaveAttribute("alt", /message thread/);
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: /Scheduling/ })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: /Scheduling/ })).toBeFocused();
});
