import { afterAll, describe, expect, it } from "vitest";
import {
  addMember,
  approvedCustomer,
  asUser,
  createAdmin,
  createApprovedContractor,
  createUser,
  postRequest,
  sql,
  submitQuote,
} from "./helpers";

afterAll(() => sql.end());

/** A project awarded at $3,200 with an accepted $850 subcontract. */
async function awarded() {
  const admin = await createAdmin();
  const customer = await approvedCustomer(admin);
  const primeOwner = await createUser("Marcus Bell");
  const primeId = await createApprovedContractor(primeOwner, admin, "Harborline Facility Services");
  const subOwner = await createUser("Sofia Reyes");
  const subId = await createApprovedContractor(subOwner, admin, "Reyes Window Works");
  const requestId = await postRequest(customer.owner, customer.orgId);
  const quote = await submitQuote(primeOwner, requestId, primeId, 320000);
  await asUser(customer.owner, (tx) => tx`select public.accept_quote(${quote})`);
  const [{ id: subcontractId }] = await asUser(primeOwner, (tx) => tx<{ id: string }[]>`
    select public.offer_subcontract(${requestId}, ${subId}, 'Exterior windows on all three floors.', 85000) as id
  `);
  await asUser(subOwner, (tx) => tx`select public.respond_to_subcontract(${subcontractId}, true, null)`);
  return { admin, customer, primeOwner, primeId, subOwner, subId, requestId, subcontractId };
}

const create = (userId: string, context: string, target: string) =>
  asUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select public.create_invoice(${context}::public.work_context, ${target}) as id`;
    return id;
  });

const get = (userId: string, id: string) =>
  asUser(userId, async (tx) => {
    const [row] = await tx<
      {
        status: string;
        number: string | null;
        lines: { description: string; quantity: number; unit_cents: number; amount_cents: number }[];
        subtotal_cents: string;
        tax_cents: string;
        total_cents: string;
        viewer_side: string;
        overdue: boolean;
      }[]
    >`select * from public.get_invoice(${id})`;
    return row;
  });

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const save = (userId: string, id: string, lines: unknown, taxRate = 0, due = inDays(30)) =>
  asUser(userId, (tx) => tx`
    select public.save_invoice_draft(${id}, ${due}::date, 'Thanks for your business.', 'Checks to Harborline Facility Services LLC.',
                                     ${taxRate}, ${tx.json(lines as never)})
  `);

const kinds = async (userId: string) =>
  (await sql<{ kind: string }[]>`select kind from public.notifications where user_id = ${userId} order by created_at, id`).map((n) => n.kind);

describe("invoices", () => {
  it("go from a prefilled draft to issued and paid, with totals worked out in the database", async () => {
    const p = await awarded();

    // Only the business doing the work invoices, and only its dispatchers.
    await expect(create(p.customer.owner, "project", p.requestId)).rejects.toThrow(/Not found/);
    await expect(create(p.subOwner, "project", p.requestId)).rejects.toThrow(/Not found/);
    const member = await createUser("Mo Member");
    await addMember(p.primeId, member, "member");
    await expect(create(member, "project", p.requestId)).rejects.toThrow(/dispatchers/);

    const id = await create(p.primeOwner, "project", p.requestId);
    const draft = await get(p.primeOwner, id);
    expect(draft).toMatchObject({ status: "draft", number: null, total_cents: "320000", viewer_side: "issuer" });
    expect(draft.lines).toEqual([expect.objectContaining({ quantity: 1, unit_cents: 320000, amount_cents: 320000 })]);

    // The customer can't see a draft.
    await expect(get(p.customer.owner, id)).rejects.toThrow(/Invoice not found/);
    expect(await asUser(p.customer.owner, (tx) => tx`select id from public.invoices where id = ${id}`)).toHaveLength(0);

    // Totals come from the lines and the tax rate, not the client.
    await save(p.primeOwner, id, [
      { description: "Nightly cleaning, three floors", quantity: 2, unit_cents: 150000, amount_cents: 1 },
      { description: "Exterior glass", quantity: 1.5, unit_cents: 13333 },
    ], 8750);
    const saved = await get(p.primeOwner, id);
    expect(saved.lines.map((l) => l.amount_cents)).toEqual([300000, 20000]);
    expect(saved).toMatchObject({ subtotal_cents: "320000", tax_cents: "28000", total_cents: "348000" });
    await expect(save(p.primeOwner, id, [{ description: "", quantity: 1, unit_cents: 100 }])).rejects.toThrow(/Describe each line/);
    await expect(save(p.primeOwner, id, [{ description: "x", quantity: 0, unit_cents: 100 }])).rejects.toThrow(/Quantities/);
    await expect(save(p.primeOwner, id, [{ description: "x", quantity: 1, unit_cents: "abc" }])).rejects.toThrow(/quantity and a price/);
    await expect(save(p.primeOwner, id, [], 30000)).rejects.toThrow(/sales tax rate/);

    // Writes only through the functions.
    await expect(asUser(p.primeOwner, (tx) => tx`update public.invoices set total_cents = 1 where id = ${id}`)).rejects.toThrow(/permission denied/);

    // Issue: numbered per business, frozen, the customer is told and sees it.
    const [{ number }] = await asUser(p.primeOwner, (tx) => tx<{ number: string }[]>`select public.issue_invoice(${id}) as number`);
    expect(number).toBe("INV-0001");
    expect(await kinds(p.customer.owner)).toContain("invoice.issued");
    const seen = await get(p.customer.owner, id);
    expect(seen).toMatchObject({ status: "issued", number: "INV-0001", total_cents: "348000", viewer_side: "recipient", overdue: false });
    await expect(save(p.primeOwner, id, [{ description: "x", quantity: 1, unit_cents: 1 }])).rejects.toThrow(/Only a draft/);
    const events = await sql<{ kind: string }[]>`select kind from public.service_request_events where request_id = ${p.requestId}`;
    expect(events.map((e) => e.kind)).toContain("invoice.issued");

    // The customer can't mark it paid; the contractor records the payment.
    await expect(
      asUser(p.customer.owner, (tx) => tx`select public.record_invoice_payment(${id}, current_date, 'check', '1042')`),
    ).rejects.toThrow(/Invoice not found/);
    await expect(
      asUser(p.primeOwner, (tx) => tx`select public.record_invoice_payment(${id}, current_date + 3, 'check', '1042')`),
    ).rejects.toThrow(/not in the future/);
    await asUser(p.primeOwner, (tx) => tx`select public.record_invoice_payment(${id}, current_date, 'check', 'Check 1042')`);
    expect((await get(p.customer.owner, id)).status).toBe("paid");
    expect(await kinds(p.customer.owner)).toContain("invoice.paid");
    await expect(asUser(p.primeOwner, (tx) => tx`select public.void_invoice(${id}, 'oops')`)).rejects.toThrow(/paid or voided/);

    // The next draft is prefilled with nothing left to bill, and numbers continue.
    const second = await create(p.primeOwner, "project", p.requestId);
    expect((await get(p.primeOwner, second)).lines).toEqual([]);
    await expect(asUser(p.primeOwner, (tx) => tx`select public.issue_invoice(${second})`)).rejects.toThrow(/at least one line/);
    await save(p.primeOwner, second, [{ description: "Extra night, lobby", quantity: 1, unit_cents: 40000 }]);
    const [{ number: n2 }] = await asUser(p.primeOwner, (tx) => tx<{ number: string }[]>`select public.issue_invoice(${second}) as number`);
    expect(n2).toBe("INV-0002");

    // Voiding an issued invoice needs a reason the customer sees.
    await expect(asUser(p.primeOwner, (tx) => tx`select public.void_invoice(${second}, '')`)).rejects.toThrow(/Say why/);
    await asUser(p.primeOwner, (tx) => tx`select public.void_invoice(${second}, 'Billed in error; included in INV-0001.')`);
    expect(await kinds(p.customer.owner)).toContain("invoice.voided");
  });

  it("bill subcontracts to the prime, out of the customer's sight", async () => {
    const p = await awarded();
    await expect(create(p.primeOwner, "subcontract", p.subcontractId)).rejects.toThrow(/Not found/);
    const id = await create(p.subOwner, "subcontract", p.subcontractId);
    expect((await get(p.subOwner, id)).total_cents).toBe("85000");
    await asUser(p.subOwner, (tx) => tx`select public.issue_invoice(${id})`);
    expect((await get(p.primeOwner, id)).viewer_side).toBe("recipient");
    await expect(get(p.customer.owner, id)).rejects.toThrow(/Invoice not found/);

    const list = (userId: string, org: string) =>
      asUser(userId, (tx) => tx<{ id: string; issuer_name: string }[]>`select * from public.org_invoices(${org})`);
    expect((await list(p.primeOwner, p.primeId)).map((i) => i.id)).toEqual([id]);
    expect((await list(p.subOwner, p.subId)).map((i) => i.id)).toEqual([id]);
    expect(await list(p.customer.owner, p.customer.orgId)).toEqual([]);
    await expect(list(p.customer.owner, p.primeId)).rejects.toThrow(/Organization not found/);

    // Each side sees it on the subcontract; the customer can't ask.
    const work = (userId: string) =>
      asUser(userId, (tx) => tx<{ id: string }[]>`select * from public.work_invoices('subcontract', ${p.subcontractId})`);
    expect(await work(p.primeOwner)).toHaveLength(1);
    await expect(work(p.customer.owner)).rejects.toThrow(/Not found/);

    // Numbers are each business's own.
    const primeInvoice = await create(p.primeOwner, "project", p.requestId);
    const [{ number }] = await asUser(p.primeOwner, (tx) => tx<{ number: string }[]>`select public.issue_invoice(${primeInvoice}) as number`);
    expect(number).toBe("INV-0001");

    // Staff see everything; others can't call the staff list.
    const all = await asUser(p.admin, (tx) => tx<{ id: string }[]>`select id from public.admin_invoices(null)`);
    expect(all.map((i) => i.id)).toEqual(expect.arrayContaining([id, primeInvoice]));
    await expect(asUser(p.primeOwner, (tx) => tx`select * from public.admin_invoices(null)`)).rejects.toThrow(/Not found/);
  });

  it("can't be raised for work that wasn't agreed, and overdue is worked out from the due date", async () => {
    const p = await awarded();
    const other = await postRequest(p.customer.owner, p.customer.orgId);
    await submitQuote(p.primeOwner, other, p.primeId);
    await expect(create(p.primeOwner, "project", other)).rejects.toThrow(/Not found/);
    await expect(create(p.primeOwner, "shift", p.requestId)).rejects.toThrow(/projects and subcontracts/);

    const id = await create(p.primeOwner, "project", p.requestId);
    await asUser(p.primeOwner, (tx) => tx`select public.issue_invoice(${id})`);
    await sql`update public.invoices set due_date = current_date - 2 where id = ${id}`;
    expect((await get(p.customer.owner, id)).overdue).toBe(true);
  });
});
