import { afterAll, describe, expect, it } from "vitest";
import {
  approvedCustomer,
  asUser,
  categoryId,
  createAdmin,
  createApprovedContractor,
  createUser,
  orgStatus,
  postRequest,
  skillId,
  sql,
  submitQuote,
} from "./helpers";

// Construction and skilled-trade services (D-042).
afterAll(() => sql.end());

describe("construction and trade services", () => {
  it("are listed with their skills, without the licensed trades", async () => {
    const categories = await asUser(await createUser(), (tx) => tx<{ slug: string; is_active: boolean }[]>`
      select slug, is_active from public.service_categories order by sort_order
    `);
    expect(categories.map((c) => c.slug)).toEqual([
      "commercial-cleaning",
      "pressure-washing",
      "landscaping",
      "facility-services",
      "general-construction",
      "carpentry",
      "painting-drywall",
      "flooring",
      "masonry-concrete",
    ]);
    expect(categories.every((c) => c.is_active)).toBe(true);
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.skills s join public.service_categories c on c.id = s.category_id
      where c.slug in ('general-construction', 'carpentry', 'painting-drywall', 'flooring', 'masonry-concrete')
    `;
    expect(n).toBe(15);
    const licensed = await sql`
      select slug from public.service_categories where slug ~ 'electric|plumb|hvac'
      union all select slug from public.skills where slug ~ 'electric|plumb|hvac|osha|licensed'
    `;
    expect(licensed).toHaveLength(0);
  });

  it("work end to end: a carpentry request reaches only carpentry contractors, and workers list trade skills", async () => {
    const admin = await createAdmin();
    const customer = await approvedCustomer(admin);
    const carpenterOwner = await createUser("Marcus Bell");
    const carpenter = await createApprovedContractor(carpenterOwner, admin, "Bayview Build Co.");
    const cleanerOwner = await createUser("Rita Rival");
    const cleaner = await createApprovedContractor(cleanerOwner, admin, "Rival Cleaning");
    // The contractor adds carpentry to the services it lists, as its owner.
    // A new service goes back to staff for review before it counts.
    const carpentry = await categoryId("carpentry");
    await asUser(carpenterOwner, (tx) => tx`
      insert into public.contractor_services (organization_id, category_id) values (${carpenter}, ${carpentry})
    `);
    expect((await orgStatus(carpenter)).status).toBe("pending_review");
    await asUser(admin, (tx) => tx`select public.review_organization(${carpenter}, 'approved', null)`);

    const requestId = await postRequest(customer.owner, customer.orgId, { category: "carpentry" });
    await submitQuote(carpenterOwner, requestId, carpenter);
    // A contractor that doesn't list carpentry can't see or quote on it.
    await expect(submitQuote(cleanerOwner, requestId, cleaner)).rejects.toThrow();

    const worker = await createUser("Ana Morales");
    const finishCarpentry = await skillId("finish-carpentry");
    await asUser(worker, async (tx) => {
      await tx`insert into public.worker_profiles (user_id, headline) values (${worker}, 'Finish carpenter')`;
      await tx`insert into public.worker_skills (user_id, skill_id) values (${worker}, ${finishCarpentry})`;
    });
    const [skill] = await sql<{ name: string }[]>`
      select s.name from public.worker_skills w join public.skills s on s.id = w.skill_id where w.user_id = ${worker}
    `;
    expect(skill.name).toBe("Finish carpentry and trim");
  });
});
