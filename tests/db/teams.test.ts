import { afterAll, describe, expect, it } from "vitest";
import { addMember, asUser, createAdmin, createApprovedContractor, createUser, sql } from "./helpers";

afterAll(() => sql.end());

type Role = "owner" | "admin" | "dispatcher" | "member";

const invite = (by: string, orgId: string, email: string, role: Role) =>
  asUser(by, async (tx) => {
    const [{ token }] = await tx<{ token: string }[]>`select public.invite_member(${orgId}, ${email}, ${role}) as token`;
    return token;
  });

const accept = (userId: string, token: string) =>
  asUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select public.accept_invitation(${token}) as id`;
    return id;
  });

const roleOf = async (orgId: string, userId: string) => {
  const [row] = await sql<{ role: Role }[]>`
    select role from public.organization_members where organization_id = ${orgId} and user_id = ${userId}
  `;
  return row?.role ?? null;
};

const emailOf = async (userId: string) => {
  const [row] = await sql<{ email: string }[]>`select email from public.profiles where id = ${userId}`;
  return row.email;
};

async function team() {
  const owner = await createUser("Olivia Owner");
  const admin = await createAdmin();
  const orgId = await createApprovedContractor(owner, admin);
  return { owner, staff: admin, orgId };
}

describe("invitations", () => {
  it("lets an owner invite someone who joins with the invited email", async () => {
    const { owner, orgId } = await team();
    const dispatcher = await createUser("Dee Dispatcher");
    const token = await invite(owner, orgId, (await emailOf(dispatcher)).toUpperCase(), "dispatcher");
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // The token itself is never stored.
    const stored = await sql`select token_hash from public.organization_invitations where organization_id = ${orgId}`;
    expect(stored[0].token_hash).not.toBe(token);

    const preview = await asUser(dispatcher, (tx) => tx`select * from public.invitation_preview(${token})`);
    expect(preview[0]).toMatchObject({ organization_name: "Bayshore Clean Co", role: "dispatcher", invited_by_name: "Olivia Owner", state: "open" });

    expect(await accept(dispatcher, token)).toBe(orgId);
    expect(await roleOf(orgId, dispatcher)).toBe("dispatcher");
    const after = await asUser(dispatcher, (tx) => tx`select state from public.invitation_preview(${token})`);
    expect(after[0].state).toBe("accepted");
    await expect(accept(dispatcher, token)).rejects.toThrow("already been used");
  });

  it("refuses the wrong account, a bad token, and expired or withdrawn invitations", async () => {
    const { owner, orgId } = await team();
    const invited = await createUser("Invited Person");
    const someoneElse = await createUser("Someone Else");
    const token = await invite(owner, orgId, await emailOf(invited), "member");

    await expect(accept(someoneElse, token)).rejects.toThrow("Sign in with that email address");
    await expect(accept(invited, "0".repeat(64))).rejects.toThrow("not valid");
    expect(await asUser(someoneElse, (tx) => tx`select * from public.invitation_preview(${"0".repeat(64)})`)).toHaveLength(0);

    await sql`update public.organization_invitations set expires_at = now() - interval '1 minute' where organization_id = ${orgId}`;
    await expect(accept(invited, token)).rejects.toThrow("expired");

    const fresh = await invite(owner, orgId, await emailOf(invited), "member");
    const [{ id }] = await sql`select id from public.organization_invitations where organization_id = ${orgId} and revoked_at is null and accepted_at is null`;
    await asUser(owner, (tx) => tx`select public.revoke_invitation(${id})`);
    await expect(accept(invited, fresh)).rejects.toThrow("withdrawn");
    expect(await roleOf(orgId, invited)).toBeNull();
  });

  it("replaces an open invitation to the same address", async () => {
    const { owner, orgId } = await team();
    const invited = await createUser("Twice Invited");
    const first = await invite(owner, orgId, await emailOf(invited), "member");
    const second = await invite(owner, orgId, await emailOf(invited), "dispatcher");
    await expect(accept(invited, first)).rejects.toThrow("withdrawn");
    await accept(invited, second);
    expect(await roleOf(orgId, invited)).toBe("dispatcher");
  });

  it("limits who can invite and which roles", async () => {
    const { owner, orgId } = await team();
    const orgAdmin = await createUser("Ada Admin");
    const member = await createUser("Mo Member");
    await addMember(orgId, orgAdmin, "admin");
    await addMember(orgId, member, "member");
    const outsider = await createUser("Outsider");

    await expect(invite(member, orgId, "new@example.test", "member")).rejects.toThrow("Only an owner or admin");
    await expect(invite(outsider, orgId, "new@example.test", "member")).rejects.toThrow("Only an owner or admin");
    await expect(invite(owner, orgId, "new@example.test", "owner")).rejects.toThrow("An owner can make them an owner");
    await expect(invite(orgAdmin, orgId, "new@example.test", "admin")).rejects.toThrow("Only an owner can invite an admin");
    await expect(invite(owner, orgId, await emailOf(member), "member")).rejects.toThrow("already a member");
    await expect(invite(owner, orgId, "not-an-email", "member")).rejects.toThrow();
    expect(await invite(orgAdmin, orgId, "crew@example.test", "dispatcher")).toMatch(/^[0-9a-f]{64}$/);

    // Members and outsiders cannot list invitations; managers can.
    const asMember = await asUser(member, (tx) => tx`select id from public.organization_invitations where organization_id = ${orgId}`);
    expect(asMember).toHaveLength(0);
    const asOwner = await asUser(owner, (tx) => tx`select email, role from public.organization_invitations where organization_id = ${orgId}`);
    expect(asOwner).toEqual([{ email: "crew@example.test", role: "dispatcher" }]);
    await expect(asUser(owner, (tx) => tx`select token_hash from public.organization_invitations`)).rejects.toThrow("permission denied");
    await expect(
      asUser(owner, (tx) => tx`insert into public.organization_invitations (organization_id, email, role, token_hash) values (${orgId}, 'x@example.test', 'member', ${"a".repeat(64)})`),
    ).rejects.toThrow("permission denied");
  });
});

describe("roles and removal", () => {
  it("keeps at least one owner", async () => {
    const { owner, orgId } = await team();
    await expect(asUser(owner, (tx) => tx`select public.change_member_role(${orgId}, ${owner}, 'admin')`)).rejects.toThrow("needs an owner");
    await expect(asUser(owner, (tx) => tx`select public.remove_member(${orgId}, ${owner})`)).rejects.toThrow("needs an owner");

    const second = await createUser("Second Owner");
    await addMember(orgId, second, "member");
    await asUser(owner, (tx) => tx`select public.change_member_role(${orgId}, ${second}, 'owner')`);
    await asUser(owner, (tx) => tx`select public.remove_member(${orgId}, ${owner})`);
    expect(await roleOf(orgId, owner)).toBeNull();
    expect(await roleOf(orgId, second)).toBe("owner");
  });

  it("lets admins manage dispatchers and members only", async () => {
    const { owner, orgId } = await team();
    const orgAdmin = await createUser("Ada Admin");
    const otherAdmin = await createUser("Al Admin");
    const member = await createUser("Mo Member");
    await addMember(orgId, orgAdmin, "admin");
    await addMember(orgId, otherAdmin, "admin");
    await addMember(orgId, member, "member");

    await asUser(orgAdmin, (tx) => tx`select public.change_member_role(${orgId}, ${member}, 'dispatcher')`);
    expect(await roleOf(orgId, member)).toBe("dispatcher");
    await expect(asUser(orgAdmin, (tx) => tx`select public.change_member_role(${orgId}, ${member}, 'admin')`)).rejects.toThrow("Only an owner");
    await expect(asUser(orgAdmin, (tx) => tx`select public.change_member_role(${orgId}, ${owner}, 'member')`)).rejects.toThrow("Only an owner");
    await expect(asUser(orgAdmin, (tx) => tx`select public.remove_member(${orgId}, ${otherAdmin})`)).rejects.toThrow("Only an owner");
    await expect(asUser(member, (tx) => tx`select public.remove_member(${orgId}, ${orgAdmin})`)).rejects.toThrow("not a member");

    await asUser(orgAdmin, (tx) => tx`select public.remove_member(${orgId}, ${member})`);
    expect(await roleOf(orgId, member)).toBeNull();
    // Anyone may leave.
    await asUser(otherAdmin, (tx) => tx`select public.remove_member(${orgId}, ${otherAdmin})`);
    expect(await roleOf(orgId, otherAdmin)).toBeNull();
  });

  it("records invitations and membership changes in the audit log", async () => {
    const { owner, orgId } = await team();
    const invited = await createUser("Audited Person");
    const token = await invite(owner, orgId, await emailOf(invited), "member");
    await accept(invited, token);
    const rows = await sql<{ action: string }[]>`
      select action from public.audit_log where organization_id = ${orgId} and entity_type in ('organization_invitation', 'organization_member')
      order by occurred_at
    `;
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["organization_invitation.created", "organization_invitation.updated"]));
  });
});
