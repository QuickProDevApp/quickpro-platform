import { afterAll, describe, expect, it } from "vitest";
import {
  addMember,
  approvedCustomer,
  asAnon,
  asUser,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createSubmittableContractor,
  createUser,
  moveJob,
  postJob,
  postRequest,
  sql,
  submitQuote,
} from "./helpers";

afterAll(() => sql.end());

const publish = (userId: string, orgId: string, slug: string, on = true) =>
  asUser(userId, async (tx) => {
    const [{ slug: saved }] = await tx<{ slug: string }[]>`select public.set_public_profile(${orgId}, ${on}, ${slug}) as slug`;
    return saved;
  });

const directory = (category: string | null = null, area: string | null = null) =>
  asAnon((tx) => tx<{ slug: string; name: string; services: string[]; areas: string[]; rating_count: number; insurance_reviewed: boolean }[]>`
    select * from public.public_contractors(${category}, ${area})
  `);

const profile = async (slug: string) => {
  const [row] = await asAnon((tx) => tx<Record<string, unknown>[]>`select * from public.public_contractor(${slug})`);
  return row;
};

describe("public contractor profiles", () => {
  it("are opt-in, approved contractors only, and show only what's safe to show anyone", async () => {
    const admin = await createAdmin();
    const owner = await createUser("Marcus Bell");
    const orgId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
    const slug = `harborline-${orgId.slice(0, 8)}`;

    // Not listed until they publish.
    expect((await directory()).map((c) => c.slug)).not.toContain(slug);

    // Owners and admins only; the address is cleaned up and must be free.
    const dispatcher = await createUser("Dee Dispatcher");
    await addMember(orgId, dispatcher, "dispatcher");
    await expect(publish(dispatcher, orgId, slug)).rejects.toThrow(/Only owners and admins/);
    const stranger = await createUser("Sam Stranger");
    await expect(publish(stranger, orgId, slug)).rejects.toThrow(/Organization not found/);
    await expect(publish(owner, orgId, "!!")).rejects.toThrow(/3 to 60/);
    expect(await publish(owner, orgId, `  Harborline ${orgId.slice(0, 8)}!! `)).toBe(slug);

    const listed = (await directory()).find((c) => c.slug === slug)!;
    expect(listed).toMatchObject({ name: "Harborline Facility Services", services: ["Commercial cleaning"], areas: ["Islip"], rating_count: 0 });
    expect(listed.insurance_reviewed).toBe(true);
    expect((await directory("commercial-cleaning", "islip")).map((c) => c.slug)).toContain(slug);
    expect((await directory("landscaping", null)).map((c) => c.slug)).not.toContain(slug);
    expect((await directory(null, "southold")).map((c) => c.slug)).not.toContain(slug);

    // No contact details, addresses or ids, even to someone not signed in.
    const page = await profile(slug);
    expect(page).toBeDefined();
    expect(Object.keys(page)).not.toEqual(expect.arrayContaining(["phone"]));
    for (const key of ["phone", "email", "address_line1", "organization_id", "id", "legal_name"]) expect(page).not.toHaveProperty(key);

    // The anonymous role still can't read the tables.
    await expect(asAnon((tx) => tx`select * from public.organizations`)).rejects.toThrow(/permission denied/);
    await expect(asAnon((tx) => tx`select * from public.contractor_public_profiles`)).rejects.toThrow(/permission denied/);
    await expect(asAnon((tx) => tx`select public.set_public_profile(${orgId}, false, ${slug})`)).rejects.toThrow(/permission denied/);

    // Someone else can't take the address.
    const otherOwner = await createUser("Olive Other");
    const otherId = await createApprovedContractor(otherOwner, admin, "Other Clean Co");
    await expect(publish(otherOwner, otherId, slug)).rejects.toThrow(/taken/);

    // Not approved yet: can't publish. Suspended: drops out.
    const draftOwner = await createUser("Dana Draft");
    const draftId = await createSubmittableContractor(draftOwner, "Draft Clean Co");
    await expect(publish(draftOwner, draftId, `draft-${draftId.slice(0, 8)}`)).rejects.toThrow(/once QuickPro staff approve/);
    await asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'suspended', 'Paperwork lapsed.')`);
    expect(await profile(slug)).toBeUndefined();
    await asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'approved', null)`);
    expect(await profile(slug)).toBeDefined();

    // Unpublishing keeps the row and hides the page.
    await publish(owner, orgId, slug, false);
    expect(await profile(slug)).toBeUndefined();
    const [row] = await sql<{ is_published: boolean }[]>`select is_published from public.contractor_public_profiles where organization_id = ${orgId}`;
    expect(row.is_published).toBe(false);
  });

  it("show published customer reviews, without names, and not workers' shift reviews", async () => {
    const admin = await createAdmin();
    const customer = await approvedCustomer(admin, "Carleton Office Park");
    const owner = await createUser("Marcus Bell");
    const orgId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
    const worker = await createUser("Wes Worker");
    await createApprovedWorker(worker, admin);
    const requestId = await postRequest(customer.owner, customer.orgId);
    const quote = await submitQuote(owner, requestId, orgId, 320000);
    await asUser(customer.owner, (tx) => tx`select public.accept_quote(${quote})`);
    const jobId = await postJob(owner, orgId, { requestId, headcount: 1 });
    await asUser(worker, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
    const [{ id: shift }] = await asUser(owner, (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`);
    await asUser(worker, (tx) => tx`select public.respond_to_offer(${shift}, true)`);
    await moveJob(jobId, -30, 240);
    await asUser(worker, (tx) => tx`select public.check_in(${shift})`);
    await asUser(worker, (tx) => tx`select public.check_out(${shift})`);
    await asUser(owner, (tx) => tx`select public.complete_job(${jobId})`);
    await asUser(owner, (tx) => tx`select public.report_request_work_complete(${requestId}, 'All done')`);
    await asUser(customer.owner, (tx) => tx`select public.confirm_request_completion(${requestId})`);
    const slug = await publish(owner, orgId, `harborline-${orgId.slice(0, 8)}`);

    const review = (userId: string, context: string, target: string, rating: number, body: string) =>
      asUser(userId, (tx) => tx`select public.submit_review(${context}::public.work_context, ${target}, ${rating}, ${body})`);
    const reviews = () => asAnon((tx) => tx<{ rating: number; body: string; reviewer: string; area_name: string }[]>`
      select * from public.public_contractor_reviews(${slug})
    `);

    // Double-blind: not public until both sides have reviewed.
    await review(customer.owner, "project", requestId, 5, "Floors look new. The crew was on time every night.");
    expect(await reviews()).toEqual([]);
    await review(owner, "project", requestId, 4, "Clear scope.");
    await review(worker, "shift", shift, 2, "Long night, no break.");
    await review(owner, "shift", shift, 5, "Great work.");

    const shown = await reviews();
    expect(shown).toEqual([expect.objectContaining({ rating: 5, reviewer: "Customer", area_name: "Islip" })]);
    expect(JSON.stringify(shown)).not.toMatch(/Carleton|Casey/);
    const page = await profile(slug);
    expect(page).toMatchObject({ completed_projects: 1 });
    // The rating counts every published review about the business, as in the app's directories.
    expect(Number(page.rating_count)).toBeGreaterThanOrEqual(1);

    // Hidden by staff: gone from the public page.
    const [{ id: reviewId }] = await sql<{ id: string }[]>`
      select id from public.reviews where subject_org_id = ${orgId} and author_side = 'customer'
    `;
    await asUser(admin, (tx) => tx`select public.moderate_review(${reviewId}, true, 'Test')`);
    expect(await reviews()).toEqual([]);
  });
});
