import { afterAll, describe, expect, it } from "vitest";
import {
  areaId,
  asUser,
  categoryId,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createSubmittableContractor,
  createUser,
  nassauId,
  orgStatus,
  skillId,
  sql,
  workerStatus,
} from "./helpers";

afterAll(() => sql.end());

describe("approved contractors: what triggers re-review", () => {
  it("keeps approval for contact details, areas in the market, and removing a category", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await createApprovedContractor(owner, admin);
    const babylon = await areaId("babylon");
    const landscaping = await categoryId("landscaping");
    await sql`insert into public.contractor_services (organization_id, category_id) values (${orgId}, ${landscaping})`;

    await asUser(owner, async (tx) => {
      await tx`update public.organizations set phone = '631-555-0199', description = 'Night crews', crew_size = 12 where id = ${orgId}`;
      await tx`insert into public.contractor_service_areas (organization_id, service_area_id) values (${orgId}, ${babylon})`;
      await tx`delete from public.contractor_services where organization_id = ${orgId} and category_id = ${landscaping}`;
    });
    expect(await orgStatus(orgId)).toEqual({ status: "approved", rereview_reason: null });
  });

  it("sends the business back to review when its name or legal name changes", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await createApprovedContractor(owner, admin);
    await asUser(owner, (tx) => tx`update public.organizations set legal_name = 'New Owner Holdings LLC' where id = ${orgId}`);
    expect(await orgStatus(orgId)).toEqual({ status: "pending_review", rereview_reason: "Business name or legal name changed" });

    // Locked again while staff look at it.
    await expect(
      asUser(owner, (tx) => tx`update public.organizations set name = 'Again' where id = ${orgId}`),
    ).rejects.toThrow(/cannot be changed while QuickPro staff are reviewing them/);

    await asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'approved', null)`);
    expect(await orgStatus(orgId)).toEqual({ status: "approved", rereview_reason: null });
  });

  it("sends the business back to review when it adds a service category, and collects reasons", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await createApprovedContractor(owner, admin);
    const [washing, landscaping] = [await categoryId("pressure-washing"), await categoryId("landscaping")];
    await asUser(owner, (tx) => tx`insert into public.contractor_services (organization_id, category_id) values (${orgId}, ${washing})`);
    await asUser(owner, (tx) => tx`insert into public.contractor_services (organization_id, category_id) values (${orgId}, ${landscaping})`);
    expect(await orgStatus(orgId)).toEqual({
      status: "pending_review",
      rereview_reason: "Added service category: Pressure washing; Added service category: Landscaping",
    });
  });

  it("lets staff edit without triggering re-review, and keeps the market staff-only", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await createApprovedContractor(owner, admin);
    await asUser(admin, (tx) => tx`update public.organizations set name = 'Corrected Name Inc' where id = ${orgId}`);
    expect((await orgStatus(orgId)).status).toBe("approved");

    const nassau = await nassauId();
    await expect(
      asUser(owner, (tx) => tx`update public.organizations set market_id = ${nassau} where id = ${orgId}`),
    ).rejects.toThrow(/Only QuickPro staff can move/);
  });

  it("does not let suspended businesses rename themselves", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await createApprovedContractor(owner, admin);
    await asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'suspended', 'Complaint under review')`);
    await expect(
      asUser(owner, (tx) => tx`update public.organizations set name = 'Fresh Start LLC' where id = ${orgId}`),
    ).rejects.toThrow(/while the organization is suspended/);
  });
});

describe("approved workers: what triggers re-review", () => {
  it("keeps approval for availability, towns, travel, pay, headline and removing skills", async () => {
    const [worker, admin] = [await createUser("Maria Lopez"), await createAdmin()];
    await createApprovedWorker(worker, admin);
    const [islip, extra] = [await areaId("islip"), await skillId("window-cleaning")];
    await sql`insert into public.worker_skills (user_id, skill_id) values (${worker}, ${extra})`;

    await asUser(worker, async (tx) => {
      await tx`update public.worker_profiles set headline = 'Floor care lead', max_travel_miles = 40, desired_hourly_rate_cents = 2800 where user_id = ${worker}`;
      await tx`insert into public.worker_service_areas (user_id, service_area_id) values (${worker}, ${islip})`;
      await tx`insert into public.worker_availability (user_id, weekday, start_time, end_time) values (${worker}, 0, '09:00', '13:00')`;
      await tx`delete from public.worker_skills where user_id = ${worker} and skill_id = ${extra}`;
      await tx`update public.profiles set phone = '631-555-0177' where id = ${worker}`;
    });
    expect(await workerStatus(worker)).toEqual({ status: "approved", rereview_reason: null });
  });

  it("sends the profile back to review when a skill is added or the name changes", async () => {
    const [worker, admin] = [await createUser("Maria Lopez"), await createAdmin()];
    await createApprovedWorker(worker, admin);
    const skill = await skillId("pressure-washer-operation");
    await asUser(worker, (tx) => tx`insert into public.worker_skills (user_id, skill_id) values (${worker}, ${skill})`);
    await asUser(worker, (tx) => tx`update public.profiles set full_name = 'Maria Lopez-Diaz' where id = ${worker}`);
    expect(await workerStatus(worker)).toEqual({
      status: "pending_review",
      rereview_reason: "Added skill: Pressure washer operation; Full name changed",
    });
    await asUser(admin, (tx) => tx`select public.review_worker_profile(${worker}, 'approved', null)`);
    expect(await workerStatus(worker)).toEqual({ status: "approved", rereview_reason: null });
  });

  it("does not flag workers who are still drafting", async () => {
    const worker = await createUser();
    const skill = await skillId("floor-care");
    await asUser(worker, async (tx) => {
      await tx`insert into public.worker_profiles (user_id) values (${worker})`;
      await tx`insert into public.worker_skills (user_id, skill_id) values (${worker}, ${skill})`;
    });
    expect(await workerStatus(worker)).toEqual({ status: "draft", rereview_reason: null });
  });
});

describe("market boundaries", () => {
  it("rejects contractor service areas outside the organization's market, even by direct insert", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const hempstead = await areaId("hempstead");
    await expect(
      asUser(owner, (tx) => tx`insert into public.contractor_service_areas (organization_id, service_area_id) values (${orgId}, ${hempstead})`),
    ).rejects.toThrow(/outside this organization's market/);
    // Staff cannot do it by accident either.
    await expect(
      sql`insert into public.contractor_service_areas (organization_id, service_area_id) values (${orgId}, ${hempstead})`,
    ).rejects.toThrow(/outside this organization's market/);
  });

  it("refuses a market move that would strand service areas", async () => {
    const admin = await createAdmin();
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const nassau = await nassauId();
    await sql`update public.markets set is_active = true where id = ${nassau}`;
    try {
      await expect(
        asUser(admin, (tx) => tx`update public.organizations set market_id = ${nassau} where id = ${orgId}`),
      ).rejects.toThrow(/Remove service areas outside the new market first/);
    } finally {
      await sql`update public.markets set is_active = false where id = ${nassau}`;
    }
  });

  it("keeps worker towns inside open markets", async () => {
    const worker = await createUser();
    const hempstead = await areaId("hempstead");
    await expect(
      asUser(worker, (tx) => tx`insert into public.worker_profiles (user_id, home_service_area_id) values (${worker}, ${hempstead})`),
    ).rejects.toThrow(/not in a market QuickPro serves yet/);
    await asUser(worker, (tx) => tx`insert into public.worker_profiles (user_id) values (${worker})`);
    await expect(
      asUser(worker, (tx) => tx`insert into public.worker_service_areas (user_id, service_area_id) values (${worker}, ${hempstead})`),
    ).rejects.toThrow(/not in a market QuickPro serves yet/);
  });
});
