import { afterAll, describe, expect, it, vi } from "vitest";
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

// Questions before the award (D-041): a private thread between the customer
// and each contractor that can see an open request.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", async () => {
  const helpers = await import("./helpers");
  return { withUser: helpers.asUser };
});

const { getQuoteThread, listQuoteThreads, postQuoteMessage } = await import("@/server/data/requests");

afterAll(() => sql.end());

async function setup(area = "islip") {
  const admin = await createAdmin();
  const customer = await approvedCustomer(admin);
  const ownerA = await createUser("Marcus Bell");
  const a = await createApprovedContractor(ownerA, admin, "Harborline Facility Services");
  const ownerB = await createUser("Rita Rival");
  const b = await createApprovedContractor(ownerB, admin, "Rival Cleaning");
  const requestId = await postRequest(customer.owner, customer.orgId, { area });
  return { admin, customer, ownerA, a, ownerB, b, requestId };
}

const notes = (userId: string) =>
  sql<{ kind: string; title: string; body: string; link_path: string; read_at: Date | null }[]>`
    select kind, title, body, link_path, read_at from public.notifications where user_id = ${userId} and kind = 'request.question'
    order by created_at
  `;

describe("questions before the award", () => {
  it("are private between the customer and each contractor, with notifications both ways", async () => {
    const s = await setup();

    // A matching contractor asks before quoting; the customer is told.
    await postQuoteMessage(s.ownerA, s.requestId, s.a, "Is the loading dock open after 6 PM?");
    const [toCustomer] = await notes(s.customer.owner);
    expect(toCustomer).toMatchObject({
      title: "Question from Harborline Facility Services: Nightly office cleaning",
      body: "Marcus Bell: Is the loading dock open after 6 PM?",
      link_path: `/app/org/${s.customer.orgId}/requests/${s.requestId}`,
    });

    // The customer answers in that thread; only that contractor is told.
    await postQuoteMessage(s.customer.owner, s.requestId, s.a, "Yes, until 11 PM. Badge at the front desk.");
    expect((await notes(s.ownerA)).map((n) => n.title)).toEqual(["Message from Harbor Office Park: Nightly office cleaning"]);
    expect(await notes(s.ownerB)).toEqual([]);

    // Each side reads the thread; the other contractor can't.
    const thread = await getQuoteThread(s.ownerA, s.requestId, s.a);
    expect(thread.map((m) => [m.author_side, m.organization_name, m.body])).toEqual([
      ["contractor", "Harborline Facility Services", "Is the loading dock open after 6 PM?"],
      ["customer", "Harbor Office Park", "Yes, until 11 PM. Badge at the front desk."],
    ]);
    expect(await getQuoteThread(s.customer.owner, s.requestId, s.a)).toHaveLength(2);
    await expect(getQuoteThread(s.ownerB, s.requestId, s.a)).rejects.toThrow(/Request not found/);
    expect(await asUser(s.ownerB, (tx) => tx`select id from public.request_quote_messages`)).toHaveLength(0);
    // The text is only read through the function.
    await expect(asUser(s.ownerA, (tx) => tx`select body from public.request_quote_messages`)).rejects.toThrow(/permission denied/);
    // Nobody writes the table directly.
    await expect(
      asUser(s.ownerB, (tx) => tx`
        insert into public.request_quote_messages (request_id, contractor_id, author_id, author_org_id, body)
        values (${s.requestId}, ${s.a}, ${s.ownerB}, ${s.b}, 'Sneaky')
      `),
    ).rejects.toThrow(/permission denied/);
    // Rival can't post into A's thread either.
    await expect(postQuoteMessage(s.ownerB, s.requestId, s.a, "Hello")).rejects.toThrow(/Request not found/);

    // The rival has its own thread; the customer sees both, latest first, and who is waiting.
    await postQuoteMessage(s.ownerB, s.requestId, s.b, "Do you supply the paper products?");
    const threads = await listQuoteThreads(s.customer.owner, s.requestId);
    expect(threads.map((t) => [t.contractor_name, t.message_count, t.awaiting_customer])).toEqual([
      ["Rival Cleaning", 1, true],
      ["Harborline Facility Services", 2, false],
    ]);
    await expect(listQuoteThreads(s.ownerA, s.requestId)).rejects.toThrow(/Request not found/);
    // Staff can read for support, but don't write in it.
    expect(await getQuoteThread(s.admin, s.requestId, s.b)).toHaveLength(1);
    await expect(postQuoteMessage(s.admin, s.requestId, s.b, "Staff here")).rejects.toThrow(/Only the customer and the contractor/);

    // Repeated messages update the one unread notification instead of piling up.
    await postQuoteMessage(s.ownerB, s.requestId, s.b, "And the trash liners?");
    const rivalNotes = (await notes(s.customer.owner)).filter((n) => n.title.startsWith("Question from Rival"));
    expect(rivalNotes).toHaveLength(1);
    expect(rivalNotes[0].body).toBe("Rita Rival: And the trash liners?");

    // A quote can follow, and the customer can still ask about it.
    const quote = await submitQuote(s.ownerA, s.requestId, s.a);
    await postQuoteMessage(s.customer.owner, s.requestId, s.a, "Does the price include weekends?");
    expect((await listQuoteThreads(s.customer.owner, s.requestId)).find((t) => t.contractor_id === s.a)?.quote_status).toBe(
      "submitted",
    );

    // Accepting a quote closes every thread; each side keeps reading its own.
    await asUser(s.customer.owner, (tx) => tx`select public.accept_quote(${quote})`);
    await expect(postQuoteMessage(s.ownerA, s.requestId, s.a, "Thanks!")).rejects.toThrow(/Questions close/);
    await expect(postQuoteMessage(s.customer.owner, s.requestId, s.b, "Sorry")).rejects.toThrow(/Questions close/);
    expect(await getQuoteThread(s.ownerA, s.requestId, s.a)).toHaveLength(3);
    // The rival never quoted, but keeps its own thread.
    expect(await getQuoteThread(s.ownerB, s.requestId, s.b)).toHaveLength(2);
  });

  it("need dispatchers, a contractor who can see the request, and valid text", async () => {
    // A request in Brookhaven: the Islip contractors can't see it unless invited.
    const s = await setup("brookhaven");
    await expect(postQuoteMessage(s.ownerA, s.requestId, s.a, "Hi")).rejects.toThrow(/Request not found/);
    await expect(postQuoteMessage(s.customer.owner, s.requestId, s.a, "Hi")).rejects.toThrow(/can't see this request/);
    await asUser(s.customer.owner, (tx) => tx`select public.invite_contractor_to_quote(${s.requestId}, ${s.a})`);
    await postQuoteMessage(s.customer.owner, s.requestId, s.a, "We'd like your quote. Any questions?");

    // Members who aren't dispatchers read but don't write.
    const member = await createUser("Mo Member");
    await addMember(s.a, member, "member");
    expect(await getQuoteThread(member, s.requestId, s.a)).toHaveLength(1);
    await expect(postQuoteMessage(member, s.requestId, s.a, "Hi")).rejects.toThrow(/Owners, admins and dispatchers/);
    const customerMember = await createUser("Cy Member");
    await addMember(s.customer.orgId, customerMember, "member");
    await expect(postQuoteMessage(customerMember, s.requestId, s.a, "Hi")).rejects.toThrow(/Owners, admins and dispatchers/);

    // Outsiders see nothing.
    const outsider = await createUser("Olga Outsider");
    await expect(getQuoteThread(outsider, s.requestId, s.a)).rejects.toThrow(/Request not found/);
    await expect(postQuoteMessage(outsider, s.requestId, s.a, "Hi")).rejects.toThrow(/Request not found/);

    // Text rules and a rate limit.
    await expect(postQuoteMessage(s.ownerA, s.requestId, s.a, "   ")).rejects.toThrow(/Write a message first/);
    await expect(postQuoteMessage(s.ownerA, s.requestId, s.a, "x".repeat(2001))).rejects.toThrow(/under 2,000/);
    for (let i = 0; i < 10; i++) await postQuoteMessage(s.ownerA, s.requestId, s.a, `Question ${i}`);
    await expect(postQuoteMessage(s.ownerA, s.requestId, s.a, "One more")).rejects.toThrow(/too quickly/);

    // Cancelling the request closes it too, and every message is audited.
    await asUser(s.customer.owner, (tx) => tx`select public.cancel_service_request(${s.requestId}, 'Budget moved to next year.')`);
    await expect(postQuoteMessage(s.customer.owner, s.requestId, s.a, "Hi")).rejects.toThrow(/Questions close/);
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.audit_log a
      join public.request_quote_messages m on m.id::text = a.entity_id
      where a.entity_type = 'request_quote_message' and m.request_id = ${s.requestId}
    `;
    expect(n).toBe(11);
  });
});
