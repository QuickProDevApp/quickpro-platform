import { afterAll, describe, expect, it } from "vitest";
import {
  approveInsurance,
  areaId,
  asAnon,
  asUser,
  categoryId,
  createAdmin,
  createSubmittableContractor,
  createUser,
  nassauId,
  sql,
  suffolkId,
} from "./helpers";

afterAll(() => sql.end());

describe("profiles", () => {
  it("are created for new auth users and readable only by their owner", async () => {
    const alice = await createUser("Alice Ortiz");
    const bob = await createUser("Bob Chen");

    const own = await asUser(alice, (tx) => tx`select full_name, platform_role from public.profiles where id = ${alice}`);
    expect(own).toEqual([{ full_name: "Alice Ortiz", platform_role: "member" }]);

    const other = await asUser(alice, (tx) => tx`select id from public.profiles where id = ${bob}`);
    expect(other).toHaveLength(0);
  });

  it("let users edit their name but never their platform role", async () => {
    const user = await createUser();
    await asUser(user, (tx) => tx`update public.profiles set full_name = 'Renamed', phone = '631-555-0199' where id = ${user}`);
    const [row] = await sql`select full_name, phone from public.profiles where id = ${user}`;
    expect(row).toEqual({ full_name: "Renamed", phone: "631-555-0199" });

    await expect(
      asUser(user, (tx) => tx`update public.profiles set platform_role = 'admin' where id = ${user}`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("organizations", () => {
  it("creates the organization with the caller as owner", async () => {
    const owner = await createUser();
    const market = await suffolkId();
    const orgId = await asUser(owner, async (tx) => {
      const [{ id }] = await tx<{ id: string }[]>`select public.create_organization('contractor', 'Harbor Grounds', ${market}) as id`;
      return id;
    });

    const members = await asUser(owner, (tx) => tx`select user_id, role from public.organization_members where organization_id = ${orgId}`);
    expect(members).toEqual([{ user_id: owner, role: "owner" }]);
    const [org] = await asUser(owner, (tx) => tx`select status, created_by from public.organizations where id = ${orgId}`);
    expect(org).toEqual({ status: "draft", created_by: owner });
  });

  it("refuses markets that are not open yet", async () => {
    const owner = await createUser();
    const nassau = await nassauId();
    await expect(
      asUser(owner, (tx) => tx`select public.create_organization('contractor', 'Too Early Inc', ${nassau})`),
    ).rejects.toThrow(/not open in that market/);
  });

  it("is invisible and read-only to non-members", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const orgId = await createSubmittableContractor(owner);

    expect(await asUser(stranger, (tx) => tx`select id from public.organizations where id = ${orgId}`)).toHaveLength(0);
    const updated = await asUser(stranger, (tx) => tx`update public.organizations set name = 'Hijacked' where id = ${orgId}`);
    expect(updated.count).toBe(0);
    await expect(
      asUser(stranger, async (tx) => {
        const area = await areaId("babylon");
        return tx`insert into public.contractor_service_areas (organization_id, service_area_id) values (${orgId}, ${area})`;
      }),
    ).rejects.toThrow(/row-level security/);
    await expect(asAnon((tx) => tx`select id from public.organizations`)).rejects.toThrow(/permission denied/);
  });

  it("does not let owners set review fields directly", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    await expect(
      asUser(owner, (tx) => tx`update public.organizations set status = 'approved' where id = ${orgId}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(owner, (tx) => tx`insert into public.organizations (kind, name, market_id, created_by) values ('contractor', 'Direct', ${orgId}, ${owner})`),
    ).rejects.toThrow(/permission denied/);
  });

  it("lists what is missing before a contractor can submit", async () => {
    const owner = await createUser();
    const market = await suffolkId();
    const orgId = await asUser(owner, async (tx) => {
      const [{ id }] = await tx<{ id: string }[]>`select public.create_organization('contractor', 'Half Done LLC', ${market}) as id`;
      return id;
    });
    await expect(
      asUser(owner, (tx) => tx`select public.submit_organization_for_review(${orgId})`),
    ).rejects.toThrow(
      "Add business phone, business email, legal business name, at least one service category, at least one service area, a general liability certificate of insurance before submitting.",
    );
  });

  it("does not count expired insurance toward submission", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    await sql`update public.qualification_documents set expires_on = current_date - 1 where organization_id = ${orgId}`;
    await expect(
      asUser(owner, (tx) => tx`select public.submit_organization_for_review(${orgId})`),
    ).rejects.toThrow(/general liability certificate/);
  });

  it("runs the submit, review and suspend workflow with an audit trail", async () => {
    const owner = await createUser();
    const admin = await createAdmin();
    const orgId = await createSubmittableContractor(owner);

    await asUser(owner, (tx) => tx`select public.submit_organization_for_review(${orgId})`);
    await expect(
      asUser(owner, (tx) => tx`select public.submit_organization_for_review(${orgId})`),
    ).rejects.toThrow(/already been submitted/);

    // Identity fields freeze while staff review them; contact details stay editable.
    await expect(
      asUser(owner, (tx) => tx`update public.organizations set name = 'Renamed' where id = ${orgId}`),
    ).rejects.toThrow(/cannot be changed while QuickPro staff are reviewing them/);
    await asUser(owner, (tx) => tx`update public.organizations set phone = '631-555-0111' where id = ${orgId}`);

    await expect(
      asUser(owner, (tx) => tx`select public.review_organization(${orgId}, 'approved', null)`),
    ).rejects.toThrow(/Only QuickPro staff/);
    await expect(
      asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'rejected', '  ')`),
    ).rejects.toThrow(/note explaining the decision/);
    await expect(
      asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'suspended', 'no')`),
    ).rejects.toThrow(/Cannot change status from pending_review to suspended/);

    await approveInsurance(admin, orgId);
    await asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'approved', 'COI looks complete')`);
    const [org] = await sql`select status, reviewed_by, review_notes from public.organizations where id = ${orgId}`;
    expect(org).toEqual({ status: "approved", reviewed_by: admin, review_notes: "COI looks complete" });

    await asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'suspended', 'Insurance lapsed')`);

    const trail = await asUser(admin, (tx) => tx<{ action: string; actor_user_id: string; db_role: string }[]>`
      select action, actor_user_id, db_role from public.audit_log
      where entity_type = 'organization' and entity_id = ${orgId}
      order by id
    `);
    expect(trail.map((t) => t.action)).toEqual([
      "organization.created",
      "organization.updated",
      "organization.status.pending_review",
      "organization.updated",
      "organization.status.approved",
      "organization.status.suspended",
    ]);
    expect(trail.at(-1)).toMatchObject({ actor_user_id: admin, db_role: "authenticated" });
    expect(trail[2].actor_user_id).toBe(owner);
  });

  it("requires a customer address before submission", async () => {
    const owner = await createUser();
    const market = await suffolkId();
    const orgId = await asUser(owner, async (tx) => {
      const [{ id }] = await tx<{ id: string }[]>`select public.create_organization('customer', 'Sunrise Plaza', ${market}) as id`;
      await tx`update public.organizations set phone = '631-555-0122', email = 'pm@example.test' where id = ${id}`;
      return id;
    });
    await expect(
      asUser(owner, (tx) => tx`select public.submit_organization_for_review(${orgId})`),
    ).rejects.toThrow("Add business address before submitting.");

    await asUser(owner, (tx) => tx`
      update public.organizations set address_line1 = '1 Main St', city = 'Bay Shore', postal_code = '11706' where id = ${orgId}
    `);
    await asUser(owner, (tx) => tx`select public.submit_organization_for_review(${orgId})`);
    const [org] = await sql`select status from public.organizations where id = ${orgId}`;
    expect(org.status).toBe("pending_review");
  });

  it("rejects contractor capabilities on customer organizations", async () => {
    const owner = await createUser();
    const market = await suffolkId();
    const category = await categoryId("landscaping");
    await expect(
      asUser(owner, async (tx) => {
        const [{ id }] = await tx<{ id: string }[]>`select public.create_organization('customer', 'Office Park', ${market}) as id`;
        await tx`insert into public.contractor_services (organization_id, category_id) values (${id}, ${category})`;
      }),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("audit log", () => {
  it("is readable only by admins and cannot be written or altered through the API roles", async () => {
    const user = await createUser();
    await createSubmittableContractor(user);
    expect(await asUser(user, (tx) => tx`select id from public.audit_log`)).toHaveLength(0);

    await expect(
      asUser(user, (tx) => tx`insert into public.audit_log (action, entity_type, entity_id) values ('x', 'y', 'z')`),
    ).rejects.toThrow(/permission denied/);

    const admin = await createAdmin();
    await expect(asUser(admin, (tx) => tx`delete from public.audit_log`)).rejects.toThrow(/permission denied/);
    await expect(asUser(admin, (tx) => tx`update public.audit_log set action = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(
      asUser(admin, (tx) => tx`select app.write_audit('x', 'y', 'z', null, '{}'::jsonb)`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("reference data", () => {
  it("is public and read-only", async () => {
    const markets = await asAnon((tx) => tx`select slug, is_active from public.markets order by slug`);
    expect(markets).toEqual([
      { slug: "nassau-county-ny", is_active: false },
      { slug: "suffolk-county-ny", is_active: true },
    ]);
    const user = await createUser();
    await expect(
      asUser(user, (tx) => tx`insert into public.service_categories (slug, name) values ('x', 'X')`),
    ).rejects.toThrow(/permission denied/);
  });
});
