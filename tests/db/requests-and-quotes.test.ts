import { afterAll, describe, expect, it } from "vitest";
import {
  addMember,
  areaId,
  asAnon,
  asUser,
  categoryId,
  createAdmin,
  createApprovedContractor,
  createUser,
  glDocumentId,
  sql,
  suffolkId,
} from "./helpers";

afterAll(() => sql.end());

async function approvedCustomer(admin: string, name = "Harbor Office Park") {
  const owner = await createUser("Casey Customer");
  const market = await suffolkId();
  const orgId = await asUser(owner, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select public.create_organization('customer', ${name}, ${market}) as id`;
    await tx`
      update public.organizations set phone = '631-555-0123', email = 'pm@example.test',
        address_line1 = '10 Main St', city = 'Islip', postal_code = '11751' where id = ${id}
    `;
    await tx`select public.submit_organization_for_review(${id})`;
    return id;
  });
  await asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'approved', null)`);
  return { owner, orgId };
}

type RequestOverrides = { area?: string; category?: string; startsInDays?: number };

async function postRequest(userId: string, orgId: string, o: RequestOverrides = {}) {
  const category = await categoryId(o.category ?? "commercial-cleaning");
  const area = await areaId(o.area ?? "islip");
  return asUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      insert into public.service_requests
        (organization_id, title, description, category_id, service_area_id, preferred_start, budget_min_cents, budget_max_cents, created_by)
      values
        (${orgId}, 'Nightly office cleaning', 'Three floors, about 24,000 square feet, five nights a week.',
         ${category}, ${area}, current_date + ${o.startsInDays ?? 14}::int, 200000, 400000, ${userId})
      returning id
    `;
    await tx`
      insert into public.service_request_sites (request_id, address_line1, city, postal_code, access_notes, contact_name, contact_phone)
      values (${id}, '200 Carleton Ave', 'Central Islip', '11722', 'Loading dock on the east side.', 'Pat Manager', '631-555-0199')
    `;
    return id;
  });
}

const quote = (userId: string, requestId: string, contractorId: string, amountCents = 320000, validDays = 30) =>
  asUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      select public.submit_quote(${requestId}, ${contractorId}, ${amountCents},
        'Nightly cleaning of all three floors, restrooms and break rooms.', current_date + 10, current_date + ${validDays}::int) as id
    `;
    return id;
  });

async function setting() {
  const admin = await createAdmin();
  const customer = await approvedCustomer(admin);
  const contractorOwner = await createUser("Marcus Bell");
  const contractorId = await createApprovedContractor(contractorOwner, admin, "Harborline Facility Services");
  return { admin, customer, contractorOwner, contractorId };
}

const requestStatus = async (id: string) =>
  (await sql<{ status: string }[]>`select status from public.service_requests where id = ${id}`)[0].status;

const quoteStatuses = async (requestId: string) =>
  Object.fromEntries(
    (await sql<{ contractor_id: string; status: string }[]>`
      select contractor_id, status from public.quotes where request_id = ${requestId}
    `).map((q) => [q.contractor_id, q.status]),
  );

const kindsFor = async (userId: string, link: string) =>
  (await sql<{ kind: string }[]>`
    select kind from public.notifications where user_id = ${userId} and link_path like ${"%" + link} order by created_at, id
  `).map((n) => n.kind);

describe("posting service requests", () => {
  it("lets an approved customer post a request and audits it", async () => {
    const { customer } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);
    expect(await requestStatus(id)).toBe("open");
    const audit = await sql`select action from public.audit_log where entity_type = 'service_request' and entity_id = ${id}`;
    expect(audit.map((a) => a.action)).toContain("service_request.created");
  });

  it("refuses contractors, unapproved customers, past dates and towns outside the market", async () => {
    const { customer, contractorOwner, contractorId } = await setting();
    await expect(postRequest(contractorOwner, contractorId)).rejects.toThrow(/Only customer organizations/);
    await expect(postRequest(customer.owner, customer.orgId, { startsInDays: -2 })).rejects.toThrow(/can't be in the past/);
    await expect(postRequest(customer.owner, customer.orgId, { startsInDays: 400 })).rejects.toThrow(/up to a year ahead/);
    await expect(postRequest(customer.owner, customer.orgId, { area: "hempstead" })).rejects.toThrow(/town in your organization's market/);

    const draftOwner = await createUser();
    const market = await suffolkId();
    const draft = await asUser(draftOwner, async (tx) => {
      const [{ id }] = await tx<{ id: string }[]>`select public.create_organization('customer', 'Draft Plaza', ${market}) as id`;
      return id;
    });
    await expect(postRequest(draftOwner, draft)).rejects.toThrow(/must be approved by QuickPro staff/);
  });

  it("lets dispatchers post but not plain members, and never lets anyone write the status", async () => {
    const { customer } = await setting();
    const member = await createUser();
    await addMember(customer.orgId, member, "member");
    await expect(postRequest(member, customer.orgId)).rejects.toThrow(/row-level security/);
    const id = await postRequest(customer.owner, customer.orgId);
    await expect(
      asUser(customer.owner, (tx) => tx`update public.service_requests set status = 'completed' where id = ${id}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(customer.owner, (tx) => tx`update public.quotes set status = 'accepted' where request_id = ${id}`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("who sees a request", () => {
  it("shows open requests to matching contractors but keeps the site private until award", async () => {
    const { customer, contractorOwner } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);

    expect(await asUser(contractorOwner, (tx) => tx`select id from public.service_requests where id = ${id}`)).toHaveLength(1);
    expect(await asUser(contractorOwner, (tx) => tx`select * from public.service_request_sites where request_id = ${id}`)).toHaveLength(0);
    expect(await asUser(customer.owner, (tx) => tx`select * from public.service_request_sites where request_id = ${id}`)).toHaveLength(1);
    expect(await kindsFor(contractorOwner, `/requests/${id}`)).toEqual(["request.new"]);
  });

  it("hides requests from contractors outside the category or town, workers and visitors", async () => {
    const { admin, customer } = await setting();
    const id = await postRequest(customer.owner, customer.orgId, { area: "brookhaven" });
    const owner = await createUser();
    await createApprovedContractor(owner, admin, "Islip Only Co");
    expect(await asUser(owner, (tx) => tx`select id from public.service_requests where id = ${id}`)).toHaveLength(0);
    expect(await kindsFor(owner, `/requests/${id}`)).toEqual([]);
    const outsider = await createUser();
    expect(await asUser(outsider, (tx) => tx`select id from public.service_requests where id = ${id}`)).toHaveLength(0);
    await expect(asAnon((tx) => tx`select id from public.service_requests`)).rejects.toThrow(/permission denied/);
  });

  it("lets the customer invite a contractor that does not list the town", async () => {
    const { admin, customer } = await setting();
    const id = await postRequest(customer.owner, customer.orgId, { area: "brookhaven" });
    const owner = await createUser();
    const other = await createApprovedContractor(owner, admin, "Invited Co");
    await asUser(customer.owner, (tx) => tx`select public.invite_contractor_to_quote(${id}, ${other})`);
    expect(await asUser(owner, (tx) => tx`select id from public.service_requests where id = ${id}`)).toHaveLength(1);
    expect(await kindsFor(owner, `/requests/${id}`)).toEqual(["request.invited"]);
    await expect(quote(owner, id, other)).resolves.toBeTruthy();
  });

  it("refuses invitations for customer organizations or from other customers", async () => {
    const { admin, customer, contractorId } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);
    const otherCustomer = await approvedCustomer(admin, "Other Plaza");
    await expect(
      asUser(customer.owner, (tx) => tx`select public.invite_contractor_to_quote(${id}, ${otherCustomer.orgId})`),
    ).rejects.toThrow(/not available on QuickPro/);
    await expect(
      asUser(otherCustomer.owner, (tx) => tx`select public.invite_contractor_to_quote(${id}, ${contractorId})`),
    ).rejects.toThrow(/Request not found/);
  });
});

describe("quotes", () => {
  it("keeps each contractor's quote private from the others", async () => {
    const { admin, customer, contractorOwner, contractorId } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);
    const rivalOwner = await createUser();
    const rival = await createApprovedContractor(rivalOwner, admin, "Rival Clean");
    await quote(contractorOwner, id, contractorId, 320000);
    await quote(rivalOwner, id, rival, 290000);

    const mine = await asUser(contractorOwner, (tx) => tx<{ amount_cents: number }[]>`select amount_cents from public.quotes where request_id = ${id}`);
    expect(mine.map((q) => q.amount_cents)).toEqual([320000]);
    const all = await asUser(customer.owner, (tx) => tx`select id from public.quotes where request_id = ${id}`);
    expect(all).toHaveLength(2);
    const names = await asUser(contractorOwner, (tx) => tx<{ name: string }[]>`select name from public.request_party_names(${id}) order by name`);
    expect(names.map((n) => n.name)).toEqual(["Harbor Office Park", "Harborline Facility Services"]);
    expect(await kindsFor(customer.owner, `/requests/${id}`)).toEqual(["quote.received", "quote.received"]);
  });

  it("requires dispatch rights and reviewed insurance to quote", async () => {
    const { customer, contractorOwner, contractorId } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);
    const member = await createUser();
    await addMember(contractorId, member, "member");
    await expect(quote(member, id, contractorId)).rejects.toThrow(/Request not found/);
    await expect(quote(customer.owner, id, customer.orgId)).rejects.toThrow(/Request not found/);
    await sql`update public.qualification_documents set expires_on = current_date - 1 where id = ${await glDocumentId(contractorId)}`;
    await expect(quote(contractorOwner, id, contractorId)).rejects.toThrow(/general liability certificate has expired/);
  });

  it("validates the terms and lets the contractor revise or withdraw", async () => {
    const { customer, contractorOwner, contractorId } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);
    await expect(quote(contractorOwner, id, contractorId, 320000, -2)).rejects.toThrow(/valid until today or later/);
    await expect(quote(contractorOwner, id, contractorId, 320000, 400)).rejects.toThrow(/up to 180 days/);
    await expect(quote(contractorOwner, id, contractorId, 50)).rejects.toThrow(/check constraint/);

    const q = await quote(contractorOwner, id, contractorId, 320000);
    const again = await quote(contractorOwner, id, contractorId, 300000);
    expect(again).toBe(q);
    const [row] = await sql<{ amount_cents: number; revision: number }[]>`select amount_cents, revision from public.quotes where id = ${q}`;
    expect(row).toEqual({ amount_cents: 300000, revision: 2 });
    expect(await kindsFor(customer.owner, `/requests/${id}`)).toEqual(["quote.received", "quote.revised"]);

    await asUser(contractorOwner, (tx) => tx`select public.withdraw_quote(${q})`);
    expect(await quoteStatuses(id)).toEqual({ [contractorId]: "withdrawn" });
    await expect(asUser(contractorOwner, (tx) => tx`select public.withdraw_quote(${q})`)).rejects.toThrow(/Only a quote waiting/);
    // A withdrawn quote can be submitted again while the request is open.
    await quote(contractorOwner, id, contractorId, 310000);
    expect(await quoteStatuses(id)).toEqual({ [contractorId]: "submitted" });
  });
});

describe("awarding work", () => {
  it("accepts one quote, declines the rest and shares the site with the winner only", async () => {
    const { admin, customer, contractorOwner, contractorId } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);
    const rivalOwner = await createUser();
    const rival = await createApprovedContractor(rivalOwner, admin, "Rival Clean");
    const winning = await quote(contractorOwner, id, contractorId);
    await quote(rivalOwner, id, rival);

    await expect(asUser(contractorOwner, (tx) => tx`select public.accept_quote(${winning})`)).rejects.toThrow(/Quote not found/);
    await asUser(customer.owner, (tx) => tx`select public.accept_quote(${winning})`);

    expect(await requestStatus(id)).toBe("awarded");
    expect(await quoteStatuses(id)).toEqual({ [contractorId]: "accepted", [rival]: "declined" });
    expect(await asUser(contractorOwner, (tx) => tx`select * from public.service_request_sites where request_id = ${id}`)).toHaveLength(1);
    expect(await asUser(rivalOwner, (tx) => tx`select * from public.service_request_sites where request_id = ${id}`)).toHaveLength(0);
    expect(await kindsFor(contractorOwner, `/requests/${id}`)).toContain("quote.accepted");
    expect(await kindsFor(rivalOwner, `/requests/${id}`)).toContain("quote.declined");

    await expect(quote(rivalOwner, id, rival)).rejects.toThrow(/no longer taking quotes|Request not found|already decided/);
    await expect(
      asUser(customer.owner, (tx) => tx`update public.service_requests set title = 'Changed title' where id = ${id}`),
    ).resolves.toHaveLength(0);
  });

  it("refuses expired quotes and lets the customer decline with a note", async () => {
    const { customer, contractorOwner, contractorId } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);
    const q = await quote(contractorOwner, id, contractorId);
    await sql`update public.quotes set valid_until = current_date - 2 where id = ${q}`;
    await expect(asUser(customer.owner, (tx) => tx`select public.accept_quote(${q})`)).rejects.toThrow(/expired on/);
    await asUser(customer.owner, (tx) => tx`select public.decline_quote(${q}, 'Over budget')`);
    const [row] = await sql<{ status: string; decision_note: string }[]>`select status, decision_note from public.quotes where id = ${q}`;
    expect(row).toEqual({ status: "declined", decision_note: "Over budget" });
    await expect(quote(contractorOwner, id, contractorId)).rejects.toThrow(/already decided/);
  });

  it("completes awarded work and cancels with a reason", async () => {
    const { customer, contractorOwner, contractorId } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);
    await expect(asUser(customer.owner, (tx) => tx`select public.complete_service_request(${id})`)).rejects.toThrow(/Only awarded work/);
    const q = await quote(contractorOwner, id, contractorId);
    await asUser(customer.owner, (tx) => tx`select public.accept_quote(${q})`);
    await asUser(customer.owner, (tx) => tx`select public.complete_service_request(${id})`);
    expect(await requestStatus(id)).toBe("completed");
    expect(await kindsFor(contractorOwner, `/requests/${id}`)).toContain("request.completed");

    const other = await postRequest(customer.owner, customer.orgId);
    await quote(contractorOwner, other, contractorId);
    await expect(asUser(customer.owner, (tx) => tx`select public.cancel_service_request(${other}, '  ')`)).rejects.toThrow(/short reason/);
    await asUser(customer.owner, (tx) => tx`select public.cancel_service_request(${other}, 'Budget moved to next year')`);
    expect(await requestStatus(other)).toBe("cancelled");
    expect(await quoteStatuses(other)).toEqual({ [contractorId]: "declined" });
    const kinds = await kindsFor(contractorOwner, `/requests/${other}`);
    expect(kinds).toContain("request.cancelled");
    expect(kinds).not.toContain("quote.declined");
  });

  it("lets staff cancel a request and tells the customer", async () => {
    const { admin, customer } = await setting();
    const id = await postRequest(customer.owner, customer.orgId);
    await asUser(admin, (tx) => tx`select public.cancel_service_request(${id}, 'Duplicate of another request')`);
    expect(await requestStatus(id)).toBe("cancelled");
    expect(await kindsFor(customer.owner, `/requests/${id}`)).toEqual(["request.cancelled"]);
    const outsider = await createUser();
    await expect(
      asUser(outsider, (tx) => tx`select public.cancel_service_request(${id}, 'No')`),
    ).rejects.toThrow(/Request not found/);
  });
});

describe("contractor directory", () => {
  it("lists approved contractors for approved customers, filtered by category and town", async () => {
    const { admin, customer, contractorId: listed } = await setting();
    const pending = await createUser();
    const market = await suffolkId();
    await asUser(pending, (tx) => tx`select public.create_organization('contractor', 'Unapproved Co', ${market})`);

    const islip = await areaId("islip");
    const cleaning = await categoryId("commercial-cleaning");
    const rows = await asUser(customer.owner, (tx) => tx<{ id: string; name: string; serves_area: boolean; insurance_reviewed: boolean }[]>`
      select id, name, serves_area, insurance_reviewed from public.contractor_directory(${customer.orgId}, ${cleaning}, ${islip})
    `);
    const names = rows.map((r) => r.name);
    expect(names).toContain("Harborline Facility Services");
    expect(names).not.toContain("Unapproved Co");
    expect(rows.every((r) => r.serves_area)).toBe(true);
    expect(rows.find((r) => r.id === listed)).toMatchObject({ insurance_reviewed: true });

    const brookhaven = await areaId("brookhaven");
    const none = await asUser(customer.owner, (tx) => tx`select name from public.contractor_directory(${customer.orgId}, null, ${brookhaven})`);
    expect(none.map((r) => r.id)).not.toContain(listed);

    const contractorOwner = await createUser();
    const contractorId = await createApprovedContractor(contractorOwner, admin, "Peer Co");
    await expect(
      asUser(contractorOwner, (tx) => tx`select * from public.contractor_directory(${contractorId}, null, null)`),
    ).rejects.toThrow(/must be approved/);
    await expect(
      asUser(contractorOwner, (tx) => tx`select * from public.contractor_directory(${customer.orgId}, null, null)`),
    ).rejects.toThrow(/must be approved/);
  });
});
