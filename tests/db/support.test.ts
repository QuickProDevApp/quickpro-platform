import { afterAll, describe, expect, it } from "vitest";
import { approvedCustomer, asUser, createAdmin, createUser, sql } from "./helpers";

afterAll(() => sql.end());

const open = (userId: string, topic: string, subject: string, body: string, orgId: string | null = null) =>
  asUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      select public.open_support_ticket(${topic}::public.support_topic, ${subject}, ${body}, ${orgId}) as id
    `;
    return id;
  });

const post = (userId: string, id: string, body: string, internal = false) =>
  asUser(userId, (tx) => tx`select public.post_support_message(${id}, ${body}, ${internal})`);

const ticket = async (id: string) => {
  const [t] = await sql<{ status: string; priority: string; assigned_to: string | null; ref: string; last_message_side: string }[]>`
    select status, priority, assigned_to, ref::text, last_message_side from public.support_tickets where id = ${id}
  `;
  return t;
};

const notes = async (userId: string) =>
  sql<{ kind: string; link_path: string }[]>`select kind, link_path from public.notifications where user_id = ${userId} order by created_at, id`;

describe("support requests", () => {
  it("go from the person to staff and back, with internal notes the person never sees", async () => {
    const admin = await createAdmin();
    const otherStaff = await createAdmin();
    const customer = await approvedCustomer(admin);

    // Validation and the business it's about.
    await expect(open(customer.owner, "billing", "x", "Something is wrong with an invoice.")).rejects.toThrow(/short subject/);
    await expect(open(customer.owner, "billing", "Invoice total", "Too short")).rejects.toThrow(/at least 10 characters/);
    const stranger = await createUser("Sam Stranger");
    await expect(open(stranger, "billing", "Invoice total", "The invoice total looks wrong to me.", customer.orgId)).rejects.toThrow(
      /Organization not found/,
    );

    const id = await open(customer.owner, "billing", "Invoice total looks wrong", "INV-0003 from Harborline adds tax twice.", customer.orgId);
    expect(await ticket(id)).toMatchObject({ status: "open", priority: "normal", assigned_to: null, last_message_side: "requester" });
    expect(Number((await ticket(id)).ref)).toBeGreaterThanOrEqual(1001);
    expect((await notes(admin)).map((n) => n.link_path)).toContain(`/app/admin/support/${id}`);

    // Only the person and staff see it.
    expect(await asUser(stranger, (tx) => tx`select id from public.support_tickets where id = ${id}`)).toHaveLength(0);
    await expect(post(stranger, id, "Hello?")).rejects.toThrow(/Support request not found/);
    await expect(post(customer.owner, id, "A note", true)).rejects.toThrow(/Only QuickPro staff/);

    // Staff add an internal note and reply; the reply waits on the person and assigns the request.
    await post(admin, id, "Checked the invoice: tax line is entered twice by the contractor.", true);
    await post(admin, id, "Thanks, we've looked at it. Harborline needs to void it and send a corrected one; we've asked them.");
    expect(await ticket(id)).toMatchObject({ status: "waiting", assigned_to: admin, last_message_side: "staff" });
    expect((await notes(customer.owner)).filter((n) => n.kind.startsWith("support.")).map((n) => n.kind)).toEqual(["support.reply"]);

    const seen = await asUser(customer.owner, (tx) => tx<{ author_side: string; internal: boolean; body: string }[]>`
      select author_side, internal, body from public.support_messages where ticket_id = ${id} order by created_at
    `);
    expect(seen.map((m) => m.author_side)).toEqual(["requester", "staff"]);
    expect(seen.some((m) => m.body.includes("tax line is entered twice"))).toBe(false);
    const all = await asUser(admin, (tx) => tx`select id from public.support_messages where ticket_id = ${id}`);
    expect(all).toHaveLength(3);

    // Writes only through the functions.
    await expect(asUser(customer.owner, (tx) => tx`update public.support_tickets set status = 'resolved' where id = ${id}`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asUser(customer.owner, (tx) => tx`insert into public.support_messages (ticket_id, author_side, body) values (${id}, 'staff', 'hi')`),
    ).rejects.toThrow(/permission denied/);

    // The person replies: back to staff, and the assignee hears about it.
    await post(customer.owner, id, "They sent a corrected one, thanks.");
    expect((await ticket(id)).status).toBe("open");
    expect((await notes(admin)).map((n) => n.kind)).toContain("support.message");

    // Staff only: status, priority, assignment.
    await expect(
      asUser(customer.owner, (tx) => tx`select public.update_support_ticket(${id}, 'resolved', 'normal', null)`),
    ).rejects.toThrow(/Support request not found/);
    await expect(
      asUser(admin, (tx) => tx`select public.update_support_ticket(${id}, 'open', 'high', ${customer.owner})`),
    ).rejects.toThrow(/staff member/);
    await asUser(admin, (tx) => tx`select public.update_support_ticket(${id}, 'open', 'high', ${otherStaff})`);
    expect(await ticket(id)).toMatchObject({ priority: "high", assigned_to: otherStaff });
    expect((await notes(otherStaff)).map((n) => n.kind)).toContain("support.assigned");
    await asUser(admin, (tx) => tx`select public.update_support_ticket(${id}, 'resolved', 'high', ${otherStaff})`);
    expect((await ticket(id)).status).toBe("resolved");
    expect((await notes(customer.owner)).map((n) => n.kind)).toContain("support.resolved");

    // A reply within 30 days reopens it; after that, open a new one.
    await post(customer.owner, id, "Actually, one more question about the due date.");
    expect((await ticket(id)).status).toBe("open");
    await asUser(customer.owner, (tx) => tx`select public.resolve_my_support_ticket(${id})`);
    expect((await ticket(id)).status).toBe("resolved");
    await expect(asUser(customer.owner, (tx) => tx`select public.resolve_my_support_ticket(${id})`)).rejects.toThrow(/already resolved/);
    await sql`update public.support_tickets set resolved_at = now() - interval '31 days' where id = ${id}`;
    await expect(post(customer.owner, id, "Hello again")).rejects.toThrow(/more than 30 days ago/);
  });

  it("marks safety requests urgent, works for anyone signed in, and limits how many are opened", async () => {
    await createAdmin();
    const worker = await createUser("Wendy Worker");
    const id = await open(worker, "safety", "Unsafe ladder on site", "The ladder at the Islip job has a cracked rail.");
    expect((await ticket(id)).priority).toBe("urgent");
    const [staffNote] = await sql<{ title: string }[]>`
      select title from public.notifications where kind = 'support.opened' and link_path = ${`/app/admin/support/${id}`} limit 1
    `;
    expect(staffNote.title).toMatch(/^Urgent support request #\d+ Unsafe ladder/);

    for (let i = 0; i < 9; i++) await open(worker, "other", `Question ${i}`, "A question about how QuickPro works.");
    await expect(open(worker, "other", "One too many", "A question about how QuickPro works.")).rejects.toThrow(/several requests today/);
  });
});
