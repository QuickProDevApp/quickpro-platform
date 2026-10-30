import { expect, test } from "@playwright/test";
import { confirmEmail, createConfirmedAccount, PASSWORD, seedApprovedContractor, signIn, uniqueEmail } from "./support";

test("an owner invites a dispatcher who creates an account and joins", async ({ browser }, testInfo) => {
  const owner = await createConfirmedAccount("Olivia Owner", "teamowner");
  const business = `Bay Crew ${testInfo.project.name}`;
  const orgId = await seedApprovedContractor(owner.id, business);
  const inviteeEmail = uniqueEmail("teaminvitee");

  const ownerPage = await (await browser.newContext({ ...testInfo.project.use })).newPage();
  await signIn(ownerPage, owner.email, `/app/org/${orgId}`);
  await ownerPage.getByRole("link", { name: "Team" }).click();
  await ownerPage.waitForURL(`**/app/org/${orgId}/team`);
  await expect(ownerPage.getByTestId("member-row")).toHaveCount(1);

  // A bad address is refused; a good one gives a one-time link.
  await ownerPage.getByPlaceholder("name@company.com").fill("not-an-email");
  await ownerPage.getByRole("button", { name: "Create invite link" }).click();
  await expect(ownerPage.getByText("Enter a valid email address.")).toBeVisible();
  await ownerPage.getByPlaceholder("name@company.com").fill(inviteeEmail);
  await ownerPage.getByLabel("Role", { exact: true }).selectOption("dispatcher");
  await ownerPage.getByRole("button", { name: "Create invite link" }).click();
  const link = await ownerPage.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/app\/invite\/[0-9a-f]{64}$/);
  await ownerPage.reload();
  await expect(ownerPage.getByTestId("invitation-row")).toContainText(inviteeEmail);
  await expect(ownerPage.getByTestId("invitation-row")).toContainText("Dispatcher");

  // The invitee opens the link signed out, creates an account, and comes back to it.
  const invitee = await (await browser.newContext({ ...testInfo.project.use })).newPage();
  const path = new URL(link).pathname;
  await invitee.goto(path);
  await invitee.waitForURL(/\/sign-in\?next=/);
  await invitee.getByRole("link", { name: "Create an account" }).click();
  await invitee.getByLabel("Full name").fill("Dee Dispatcher");
  await invitee.getByLabel("Work email").fill(inviteeEmail);
  await invitee.getByLabel("Password").fill(PASSWORD);
  await invitee.getByRole("button", { name: "Create account" }).click();
  await invitee.waitForURL(/\/(check-email|app)/);
  if (invitee.url().includes("/check-email")) {
    await confirmEmail(inviteeEmail);
    await signIn(invitee, inviteeEmail, path);
  }
  await invitee.waitForURL(`**${path}`);
  await expect(invitee.getByRole("heading", { name: `Join ${business}` })).toBeVisible();
  await expect(invitee.getByText("Olivia Owner invited")).toBeVisible();
  await invitee.getByRole("button", { name: "Accept and join" }).click();
  await invitee.waitForURL(`**/app/org/${orgId}`);
  await expect(invitee.getByText("You are a dispatcher")).toBeVisible();

  // A dispatcher can see the team but cannot manage it.
  await invitee.goto(`/app/org/${orgId}/team`);
  await expect(invitee.getByTestId("member-row")).toHaveCount(2);
  await expect(invitee.getByRole("button", { name: "Create invite link" })).toHaveCount(0);
  await expect(invitee.getByRole("button", { name: "Save role" })).toHaveCount(0);

  // The link works only once.
  await invitee.goto(path);
  await expect(invitee.getByRole("heading", { name: "This invitation has already been used" })).toBeVisible();

  // The owner sees the new member, promotes them, then removes them.
  await ownerPage.reload();
  await expect(ownerPage.getByTestId("invitation-row")).toHaveCount(0);
  const row = ownerPage.getByTestId("member-row").filter({ hasText: "Dee Dispatcher" });
  await row.getByLabel("Role for Dee Dispatcher").selectOption("admin");
  await row.getByRole("button", { name: "Save role" }).click();
  await expect(row.getByText("Role updated.")).toBeVisible();
  await ownerPage.reload();
  await expect(ownerPage.getByTestId("member-row").filter({ hasText: "Dee Dispatcher" }).getByLabel("Role for Dee Dispatcher")).toHaveValue("admin");
  await ownerPage.getByTestId("member-row").filter({ hasText: "Dee Dispatcher" }).getByText("Remove…").click();
  await ownerPage.getByRole("button", { name: "Remove Dee Dispatcher" }).click();
  await expect(ownerPage.getByTestId("member-row")).toHaveCount(1);

  // The last owner cannot leave.
  await ownerPage.getByText("Leave…").click();
  await ownerPage.getByRole("button", { name: `Leave ${business}` }).click();
  await expect(ownerPage.getByText("Every organization needs an owner")).toBeVisible();
});

test("an invitation can't be accepted from a different account", async ({ browser }, testInfo) => {
  const owner = await createConfirmedAccount("Olivia Owner", "teamowner2");
  const orgId = await seedApprovedContractor(owner.id, `Wrong Door ${testInfo.project.name}`);
  const other = await createConfirmedAccount("Sam Someone", "teamother");

  const ownerPage = await (await browser.newContext({ ...testInfo.project.use })).newPage();
  await signIn(ownerPage, owner.email, `/app/org/${orgId}/team`);
  await ownerPage.getByPlaceholder("name@company.com").fill(uniqueEmail("intended"));
  await ownerPage.getByRole("button", { name: "Create invite link" }).click();
  const path = new URL(await ownerPage.getByLabel("Invitation link").inputValue()).pathname;

  const otherPage = await (await browser.newContext({ ...testInfo.project.use })).newPage();
  await signIn(otherPage, other.email, path);
  await expect(otherPage.getByText(`You're signed in as ${other.email}`)).toBeVisible();
  await expect(otherPage.getByRole("button", { name: "Accept and join" })).toHaveCount(0);

  // Withdrawn invitations stop working.
  await ownerPage.reload();
  await ownerPage.getByRole("button", { name: "Withdraw" }).click();
  await expect(ownerPage.getByTestId("invitation-row")).toHaveCount(0);
  await otherPage.reload();
  await expect(otherPage.getByRole("heading", { name: "This invitation was withdrawn" })).toBeVisible();
});
