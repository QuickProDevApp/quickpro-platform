import { expect, test } from "@playwright/test";
import {
  createConfirmedAccount,
  seedApprovedContractor,
  seedApprovedCustomer,
  seedApprovedWorker,
  seedAwardedProject,
  seedContractorCoverage,
  seedFinishedProject,
  seedProjectReviews,
  signIn,
} from "./support";

/**
 * Public contractor profiles: an approved contractor's owner publishes a
 * page from the business profile; a signed-out visitor finds it in the
 * directory by service and town, reads it (rating, the customer's review,
 * the staff-reviewed insurance note) and sees no contact details or names;
 * the owner unpublishes and the page is gone.
 */
test("a contractor publishes a public profile that visitors can find, then takes it down", async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const tag = Math.random().toString(36).slice(2, 7);
  const session = async () => (await browser.newContext({ ...testInfo.project.use })).newPage();

  const contractorOwner = await createConfirmedAccount("Marcus Bell", "publicprime");
  const contractorName = `Harborline Facility ${tag}`;
  const contractorId = await seedApprovedContractor(contractorOwner.id, contractorName);
  await seedContractorCoverage(contractorId, "commercial-cleaning", "islip");
  const customerOwner = await createConfirmedAccount("Priya Manager", "publiccustomer");
  const customerName = `Carleton Office Park ${tag}`;
  const customerId = await seedApprovedCustomer(customerOwner.id, customerName);
  const worker = await createConfirmedAccount("Wendy Worker", "publicworker");
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
  await seedProjectReviews({
    requestId,
    customerOwnerId: customerOwner.id,
    contractorOwnerId: contractorOwner.id,
    customerRating: 5,
    customerBody: `Floors look new ${tag}. The crew was on time every night.`,
  });

  // 1. The owner publishes from the business profile.
  const owner = await session();
  const profilePath = `/app/org/${contractorId}/profile`;
  await signIn(owner, contractorOwner.email, profilePath);
  await expect(owner.getByRole("heading", { name: "Public profile" })).toBeVisible();
  await expect(owner.getByText("Not published")).toBeVisible();
  const slug = `harborline-${tag}`;
  await owner.getByLabel("Page address").fill(`  Harborline ${tag} `);
  await owner.getByRole("button", { name: "Publish profile" }).click();
  await expect(owner.getByText("Published. Anyone can now see your profile.")).toBeVisible();
  await expect(owner.getByTestId("public-profile-link")).toHaveAttribute("href", `/contractors/${slug}`);

  // 2. A signed-out visitor finds it by service and town.
  const visitor = await session();
  await visitor.goto("/contractors");
  await expect(visitor.getByRole("heading", { name: "Commercial service businesses on QuickPro" })).toBeVisible();
  const search = visitor.getByRole("search");
  await search.getByLabel("Service").selectOption("commercial-cleaning");
  await search.getByLabel("Town").selectOption("islip");
  await search.getByRole("button", { name: "Show contractors" }).click();
  await visitor.waitForURL(/category=commercial-cleaning/);
  const card = visitor.getByTestId("public-contractor").filter({ hasText: contractorName });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Liability certificate reviewed by QuickPro staff");

  // A town the business doesn't serve doesn't list it.
  await visitor.goto("/contractors?category=commercial-cleaning&town=southold");
  await expect(visitor.getByTestId("public-contractor").filter({ hasText: contractorName })).toHaveCount(0);

  // 3. The profile: rating, the customer's review without names, the insurance note.
  await visitor.goto(`/contractors/${slug}`);
  await expect(visitor.getByRole("heading", { level: 1, name: contractorName })).toBeVisible();
  await expect(visitor.getByTestId("insurance-note")).toContainText("reviewed by QuickPro staff");
  const review = visitor.getByTestId("public-review");
  await expect(review).toHaveCount(1);
  await expect(review).toContainText(`Floors look new ${tag}`);
  await expect(review).toContainText("Customer");
  await expect(review).toContainText("Islip");
  const text = await visitor.locator("main").innerText();
  expect(text).not.toContain(customerName);
  expect(text).not.toContain("Priya");
  expect(text).not.toContain("Marcus");
  expect(text).not.toContain(contractorOwner.email);
  expect(text).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
  await expect(visitor.getByRole("link", { name: "Request a quote" }).first()).toHaveAttribute(
    "href",
    /\/sign-up\?as=customer/,
  );

  // 4. The owner unpublishes: the page is gone and the directory no longer lists it.
  await owner.getByRole("button", { name: "Unpublish" }).click();
  await expect(owner.getByText("Unpublished. Your profile is no longer public.")).toBeVisible();
  await expect(owner.getByText("Not published")).toBeVisible();

  const gone = await visitor.goto(`/contractors/${slug}`);
  expect(gone?.status()).toBe(404);
  await visitor.goto("/contractors?category=commercial-cleaning&town=islip");
  await expect(visitor.getByTestId("public-contractor").filter({ hasText: contractorName })).toHaveCount(0);
});
