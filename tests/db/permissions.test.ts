import { afterAll, describe, expect, it } from "vitest";
import {
  approveInsurance,
  areaId,
  asAnon,
  asUser,
  categoryId,
  createAdmin,
  createApprovedWorker,
  createSubmittableContractor,
  createUser,
  fakeDocument,
  glDocumentId,
  sql,
} from "./helpers";

afterAll(() => sql.end());

async function addMember(orgId: string, userId: string, role: "admin" | "dispatcher" | "member") {
  // Team invites arrive in Phase 2; tests add members directly.
  await sql`insert into public.organization_members (organization_id, user_id, role) values (${orgId}, ${userId}, ${role})`;
}

describe("organization roles", () => {
  it("lets dispatchers and members read their organization but not manage it", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const category = await categoryId("landscaping");
    const area = await areaId("babylon");

    for (const role of ["dispatcher", "member"] as const) {
      const person = await createUser();
      await addMember(orgId, person, role);

      expect(await asUser(person, (tx) => tx`select id from public.organizations where id = ${orgId}`)).toHaveLength(1);
      expect(await asUser(person, (tx) => tx`select id from public.qualification_documents where organization_id = ${orgId}`)).toHaveLength(1);

      const updated = await asUser(person, (tx) => tx`update public.organizations set phone = '631-555-0000' where id = ${orgId}`);
      expect(updated.count).toBe(0);
      await expect(
        asUser(person, (tx) => tx`insert into public.contractor_services (organization_id, category_id) values (${orgId}, ${category})`),
      ).rejects.toThrow(/row-level security/);
      await expect(
        asUser(person, (tx) => tx`insert into public.contractor_service_areas (organization_id, service_area_id) values (${orgId}, ${area})`),
      ).rejects.toThrow(/row-level security/);
      const doc = fakeDocument("org", orgId);
      await expect(
        asUser(person, (tx) => tx`
          insert into public.qualification_documents
            (id, organization_id, doc_type, title, file_name, mime_type, size_bytes, sha256, storage_path, uploaded_by)
          values (${doc.id}, ${orgId}, 'other', 'x', ${doc.file_name}, ${doc.mime_type}, ${doc.size_bytes}, ${doc.sha256}, ${doc.storage_path}, ${person})
        `),
      ).rejects.toThrow(/row-level security/);
      const glId = await glDocumentId(orgId);
      const deleted = await asUser(person, (tx) => tx`delete from public.qualification_documents where id = ${glId}`);
      expect(deleted.count).toBe(0);
      await expect(
        asUser(person, (tx) => tx`select public.submit_organization_for_review(${orgId})`),
      ).rejects.toThrow(/Only an owner or admin/);
    }
  });

  it("lets an org admin manage like the owner", async () => {
    const owner = await createUser();
    const orgAdmin = await createUser();
    const orgId = await createSubmittableContractor(owner);
    await addMember(orgId, orgAdmin, "admin");
    const updated = await asUser(orgAdmin, (tx) => tx`update public.organizations set phone = '631-555-0001' where id = ${orgId}`);
    expect(updated.count).toBe(1);
    await asUser(orgAdmin, (tx) => tx`select public.submit_organization_for_review(${orgId})`);
  });

  it("shows co-members' profiles to each other but not to outsiders", async () => {
    const owner = await createUser("Owner Person");
    const member = await createUser("Crew Member");
    const outsider = await createUser();
    const orgId = await createSubmittableContractor(owner);
    await addMember(orgId, member, "member");
    expect(await asUser(member, (tx) => tx`select id from public.profiles where id = ${owner}`)).toHaveLength(1);
    expect(await asUser(outsider, (tx) => tx`select id from public.profiles where id in (${owner}, ${member})`)).toHaveLength(0);
  });
});

describe("cross-user isolation", () => {
  it("keeps one contractor's data away from another contractor", async () => {
    const [ownerA, ownerB] = [await createUser(), await createUser()];
    const orgA = await createSubmittableContractor(ownerA, "Alpha Clean");
    await createSubmittableContractor(ownerB, "Bravo Grounds");

    const seen = await asUser(ownerB, async (tx) => ({
      orgs: await tx`select id from public.organizations where id = ${orgA}`,
      members: await tx`select user_id from public.organization_members where organization_id = ${orgA}`,
      services: await tx`select category_id from public.contractor_services where organization_id = ${orgA}`,
      areas: await tx`select service_area_id from public.contractor_service_areas where organization_id = ${orgA}`,
      docs: await tx`select id from public.qualification_documents where organization_id = ${orgA}`,
      insurance: await tx`select public.organization_insurance_status(${orgA}) as s`,
    }));
    expect(seen.orgs).toHaveLength(0);
    expect(seen.members).toHaveLength(0);
    expect(seen.services).toHaveLength(0);
    expect(seen.areas).toHaveLength(0);
    expect(seen.docs).toHaveLength(0);
    expect(seen.insurance[0].s).toBeNull();

    await expect(
      asUser(ownerB, (tx) => tx`select public.submit_organization_for_review(${orgA})`),
    ).rejects.toThrow(/Only an owner or admin/);
    const deleted = await asUser(ownerB, (tx) => tx`delete from public.contractor_services where organization_id = ${orgA}`);
    expect(deleted.count).toBe(0);
  });

  it("keeps one worker's profile, skills, availability and documents private", async () => {
    const [workerA, workerB, admin] = [await createUser(), await createUser(), await createAdmin()];
    await createApprovedWorker(workerA, admin);
    const doc = fakeDocument("worker", workerA);
    await asUser(workerA, (tx) => tx`
      insert into public.qualification_documents
        (id, worker_user_id, doc_type, title, file_name, mime_type, size_bytes, sha256, storage_path, uploaded_by)
      values (${doc.id}, ${workerA}, 'certification', 'OSHA 10', ${doc.file_name}, ${doc.mime_type}, ${doc.size_bytes}, ${doc.sha256}, ${doc.storage_path}, ${workerA})
    `);

    const seen = await asUser(workerB, async (tx) => [
      await tx`select user_id from public.worker_profiles where user_id = ${workerA}`,
      await tx`select skill_id from public.worker_skills where user_id = ${workerA}`,
      await tx`select id from public.worker_availability where user_id = ${workerA}`,
      await tx`select service_area_id from public.worker_service_areas where user_id = ${workerA}`,
      await tx`select id from public.qualification_documents where worker_user_id = ${workerA}`,
    ]);
    for (const rows of seen) expect(rows).toHaveLength(0);

    const removed = await asUser(workerB, (tx) => tx`delete from public.worker_availability where user_id = ${workerA}`);
    expect(removed.count).toBe(0);
    const changed = await asUser(workerB, (tx) => tx`update public.worker_profiles set headline = 'hacked' where user_id = ${workerA}`);
    expect(changed.count).toBe(0);
    await expect(
      asUser(workerB, (tx) => tx`insert into public.worker_skills (user_id, skill_id) select ${workerA}, id from public.skills limit 1`),
    ).rejects.toThrow(/row-level security/);

    // Staff can see everything.
    const staffView = await asUser(admin, (tx) => tx`select id from public.qualification_documents where worker_user_id = ${workerA}`);
    expect(staffView).toHaveLength(1);
  });

  it("does not let contractors read worker profiles in Phase 1", async () => {
    const [worker, owner, admin] = [await createUser(), await createUser(), await createAdmin()];
    await createApprovedWorker(worker, admin);
    await createSubmittableContractor(owner);
    expect(await asUser(owner, (tx) => tx`select user_id from public.worker_profiles`)).toHaveLength(0);
  });
});

describe("function and role boundaries", () => {
  it("blocks signed-out callers from every workflow function", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const calls = [
      (tx: Parameters<Parameters<typeof asAnon>[0]>[0]) => tx`select public.create_organization('contractor', 'Anon Co', ${orgId})`,
      (tx: Parameters<Parameters<typeof asAnon>[0]>[0]) => tx`select public.submit_organization_for_review(${orgId})`,
      (tx: Parameters<Parameters<typeof asAnon>[0]>[0]) => tx`select public.review_organization(${orgId}, 'approved', null)`,
      (tx: Parameters<Parameters<typeof asAnon>[0]>[0]) => tx`select public.submit_worker_profile_for_review()`,
      (tx: Parameters<Parameters<typeof asAnon>[0]>[0]) => tx`select public.organization_insurance_status(${orgId})`,
    ];
    for (const call of calls) {
      await expect(asAnon(call)).rejects.toThrow(/permission denied/);
    }
  });

  it("blocks non-staff from every review function", async () => {
    const [owner, worker, admin] = [await createUser(), await createUser(), await createAdmin()];
    const orgId = await createSubmittableContractor(owner);
    await asUser(owner, (tx) => tx`select public.submit_organization_for_review(${orgId})`);
    const docId = await approveInsurance(admin, orgId);
    for (const user of [owner, worker]) {
      await expect(asUser(user, (tx) => tx`select public.review_organization(${orgId}, 'approved', null)`)).rejects.toThrow(/Only QuickPro staff/);
      await expect(asUser(user, (tx) => tx`select public.review_document(${docId}, 'rejected', 'x', null)`)).rejects.toThrow(/Only QuickPro staff/);
      await expect(asUser(user, (tx) => tx`select public.review_worker_profile(${user}, 'approved', null)`)).rejects.toThrow(/Only QuickPro staff/);
    }
    await expect(asUser(owner, (tx) => tx`select app.flag_org_rereview(${orgId}, 'x')`)).rejects.toThrow(/permission denied/);
  });
});
