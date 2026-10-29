import { afterAll, describe, expect, it } from "vitest";
import {
  areaId,
  asUser,
  createAdmin,
  createSubmittableContractor,
  createUser,
  fakeDocument,
  skillId,
  sql,
} from "./helpers";

afterAll(() => sql.end());

async function createWorker(userId: string) {
  const home = await areaId("brookhaven");
  await asUser(userId, (tx) => tx`
    insert into public.worker_profiles (user_id, headline, home_service_area_id, max_travel_miles, desired_hourly_rate_cents)
    values (${userId}, 'Floor care tech, 5 years', ${home}, 20, 2400)
  `);
}

describe("worker profiles", () => {
  it("can only be created for yourself and start in draft", async () => {
    const worker = await createUser();
    const other = await createUser();
    await expect(
      asUser(worker, (tx) => tx`insert into public.worker_profiles (user_id) values (${other})`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(worker, (tx) => tx`insert into public.worker_profiles (user_id, status) values (${worker}, 'approved')`),
    ).rejects.toThrow(/permission denied/);

    await createWorker(worker);
    const [row] = await asUser(worker, (tx) => tx`select status from public.worker_profiles where user_id = ${worker}`);
    expect(row.status).toBe("draft");
    expect(await asUser(other, (tx) => tx`select user_id from public.worker_profiles where user_id = ${worker}`)).toHaveLength(0);
  });

  it("validates availability windows", async () => {
    const worker = await createUser();
    await createWorker(worker);
    await expect(
      asUser(worker, (tx) => tx`insert into public.worker_availability (user_id, weekday, start_time, end_time) values (${worker}, 2, '17:00', '09:00')`),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(worker, (tx) => tx`insert into public.worker_availability (user_id, weekday, start_time, end_time) values (${worker}, 7, '09:00', '17:00')`),
    ).rejects.toThrow(/check constraint/);
  });

  it("submits once complete and is reviewed by staff", async () => {
    const worker = await createUser("Maria Lopez");
    const admin = await createAdmin();
    await createWorker(worker);

    await expect(asUser(worker, (tx) => tx`select public.submit_worker_profile_for_review()`)).rejects.toThrow(
      "Add a phone number, at least one skill, at least one availability window before submitting.",
    );

    const skill = await skillId("floor-care");
    await asUser(worker, async (tx) => {
      await tx`update public.profiles set phone = '631-555-0142' where id = ${worker}`;
      await tx`insert into public.worker_skills (user_id, skill_id) values (${worker}, ${skill})`;
      await tx`insert into public.worker_availability (user_id, weekday, start_time, end_time) values (${worker}, 1, '18:00', '23:00')`;
      await tx`select public.submit_worker_profile_for_review()`;
    });

    await expect(
      asUser(worker, (tx) => tx`select public.review_worker_profile(${worker}, 'approved', null)`),
    ).rejects.toThrow(/Only QuickPro staff/);

    await asUser(admin, (tx) => tx`select public.review_worker_profile(${worker}, 'rejected', 'Please add a recent reference')`);
    const [row] = await sql`select status, review_notes from public.worker_profiles where user_id = ${worker}`;
    expect(row).toEqual({ status: "rejected", review_notes: "Please add a recent reference" });

    // Rejected profiles can be fixed and resubmitted.
    await asUser(worker, (tx) => tx`select public.submit_worker_profile_for_review()`);
    await asUser(admin, (tx) => tx`select public.review_worker_profile(${worker}, 'approved', null)`);
    const [after] = await sql`select status from public.worker_profiles where user_id = ${worker}`;
    expect(after.status).toBe("approved");
  });
});

describe("qualification documents", () => {
  it("can only be uploaded by org managers or the worker themself", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const orgId = await createSubmittableContractor(owner);

    const doc = fakeDocument("org", orgId);
    await expect(
      asUser(stranger, (tx) => tx`
        insert into public.qualification_documents
          (id, organization_id, doc_type, title, file_name, mime_type, size_bytes, sha256, storage_path, uploaded_by)
        values (${doc.id}, ${orgId}, 'business_license', 'License', ${doc.file_name}, ${doc.mime_type},
                ${doc.size_bytes}, ${doc.sha256}, ${doc.storage_path}, ${stranger})
      `),
    ).rejects.toThrow(/row-level security/);

    const docs = await asUser(stranger, (tx) => tx`select id from public.qualification_documents where organization_id = ${orgId}`);
    expect(docs).toHaveLength(0);
  });

  it("rejects unsafe file metadata", async () => {
    const worker = await createUser();
    await createWorker(worker);
    const doc = fakeDocument("worker", worker);
    await expect(
      asUser(worker, (tx) => tx`
        insert into public.qualification_documents
          (id, worker_user_id, doc_type, title, file_name, mime_type, size_bytes, sha256, storage_path, uploaded_by)
        values (${doc.id}, ${worker}, 'certification', 'OSHA 10', 'x.html', 'text/html',
                ${doc.size_bytes}, ${doc.sha256}, ${doc.storage_path}, ${worker})
      `),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(worker, (tx) => tx`
        insert into public.qualification_documents
          (id, worker_user_id, doc_type, title, file_name, mime_type, size_bytes, sha256, storage_path, uploaded_by)
        values (${doc.id}, ${worker}, 'certification', 'OSHA 10', ${doc.file_name}, ${doc.mime_type},
                ${doc.size_bytes}, ${doc.sha256}, ${"worker/../../etc/passwd"}, ${worker})
      `),
    ).rejects.toThrow(/check constraint/);
  });

  it("are reviewed by staff and approved ones cannot be deleted", async () => {
    const owner = await createUser();
    const admin = await createAdmin();
    const orgId = await createSubmittableContractor(owner);
    const [{ id: docId }] = await sql`select id from public.qualification_documents where organization_id = ${orgId}`;

    await expect(
      asUser(owner, (tx) => tx`update public.qualification_documents set status = 'approved' where id = ${docId}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(owner, (tx) => tx`select public.review_document(${docId}, 'approved', null, null)`),
    ).rejects.toThrow(/Only QuickPro staff/);
    await expect(
      asUser(admin, (tx) => tx`select public.review_document(${docId}, 'rejected', '', null)`),
    ).rejects.toThrow(/note explaining the rejection/);

    await asUser(admin, (tx) => tx`select public.review_document(${docId}, 'approved', 'Named insured matches', '2027-06-30')`);
    const [doc] = await sql`select status, reviewed_by, to_char(expires_on, 'YYYY-MM-DD') as expires_on from public.qualification_documents where id = ${docId}`;
    expect(doc).toEqual({ status: "approved", reviewed_by: admin, expires_on: "2027-06-30" });

    const deleted = await asUser(owner, (tx) => tx`delete from public.qualification_documents where id = ${docId}`);
    expect(deleted.count).toBe(0);
  });
});
