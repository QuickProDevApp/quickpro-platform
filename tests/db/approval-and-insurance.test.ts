import { afterAll, describe, expect, it } from "vitest";
import {
  approveInsurance,
  asUser,
  createAdmin,
  createSubmittableContractor,
  createUser,
  fakeDocument,
  glDocumentId,
  orgStatus,
  sql,
} from "./helpers";

afterAll(() => sql.end());

const APPROVAL_BLOCKED = /Approve a current general liability certificate/;

async function submitted(owner: string) {
  const orgId = await createSubmittableContractor(owner);
  await asUser(owner, (tx) => tx`select public.submit_organization_for_review(${orgId})`);
  return orgId;
}

function approve(admin: string, orgId: string) {
  return asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'approved', null)`);
}

describe("contractor approval requires reviewed, current insurance", () => {
  it("refuses while the certificate is only uploaded, not reviewed", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await submitted(owner);
    await expect(approve(admin, orgId)).rejects.toThrow(APPROVAL_BLOCKED);
    expect((await orgStatus(orgId)).status).toBe("pending_review");
  });

  it("refuses when the certificate was rejected", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await submitted(owner);
    const docId = await glDocumentId(orgId);
    await asUser(admin, (tx) => tx`select public.review_document(${docId}, 'rejected', 'Wrong named insured', null)`);
    await expect(approve(admin, orgId)).rejects.toThrow(APPROVAL_BLOCKED);
  });

  it("refuses when the certificate is missing (deleted after submission)", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await submitted(owner);
    const docId = await glDocumentId(orgId);
    const deleted = await asUser(owner, (tx) => tx`delete from public.qualification_documents where id = ${docId}`);
    expect(deleted.count).toBe(1);
    await expect(approve(admin, orgId)).rejects.toThrow(APPROVAL_BLOCKED);
  });

  it("refuses when the reviewed certificate has expired", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await submitted(owner);
    const docId = await approveInsurance(admin, orgId);
    await sql`update public.qualification_documents set expires_on = current_date - 1 where id = ${docId}`;
    await expect(approve(admin, orgId)).rejects.toThrow(APPROVAL_BLOCKED);
  });

  it("does not accept a workers' comp certificate in place of general liability", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await submitted(owner);
    const glId = await glDocumentId(orgId);
    await asUser(admin, (tx) => tx`select public.review_document(${glId}, 'rejected', 'Expired policy', null)`);
    const doc = fakeDocument("org", orgId);
    await asUser(owner, (tx) => tx`
      insert into public.qualification_documents
        (id, organization_id, doc_type, title, file_name, mime_type, size_bytes, sha256, storage_path, expires_on, uploaded_by)
      values (${doc.id}, ${orgId}, 'workers_comp_coi', 'WC', ${doc.file_name}, ${doc.mime_type},
              ${doc.size_bytes}, ${doc.sha256}, ${doc.storage_path}, current_date + 100, ${owner})
    `);
    await asUser(admin, (tx) => tx`select public.review_document(${doc.id}, 'approved', null, null)`);
    await expect(approve(admin, orgId)).rejects.toThrow(APPROVAL_BLOCKED);
  });

  it("approves once a current certificate is reviewed", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await submitted(owner);
    await approveInsurance(admin, orgId);
    await approve(admin, orgId);
    expect((await orgStatus(orgId)).status).toBe("approved");
  });

  it("refuses to reinstate a suspended contractor whose insurance has lapsed", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await submitted(owner);
    const docId = await approveInsurance(admin, orgId);
    await approve(admin, orgId);
    await asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'suspended', 'Insurance lapsed')`);
    await sql`update public.qualification_documents set expires_on = current_date - 1 where id = ${docId}`;
    await expect(approve(admin, orgId)).rejects.toThrow(APPROVAL_BLOCKED);
    expect((await orgStatus(orgId)).status).toBe("suspended");
  });

  it("does not require insurance for customer organizations", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const [{ id: market }] = await sql`select id from public.markets where slug = 'suffolk-county-ny'`;
    const orgId = await asUser(owner, async (tx) => {
      const [{ id }] = await tx<{ id: string }[]>`select public.create_organization('customer', 'Harbor Office Park', ${market}) as id`;
      await tx`
        update public.organizations set phone = '631-555-0123', email = 'pm@example.test',
          address_line1 = '10 Main St', city = 'Islip', postal_code = '11751' where id = ${id}
      `;
      await tx`select public.submit_organization_for_review(${id})`;
      return id;
    });
    await approve(admin, orgId);
    expect((await orgStatus(orgId)).status).toBe("approved");
  });
});

describe("insurance document review", () => {
  it("requires an expiration date and refuses expired certificates", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await createSubmittableContractor(owner);
    const docId = await glDocumentId(orgId);

    await sql`update public.qualification_documents set expires_on = null where id = ${docId}`;
    await expect(
      asUser(admin, (tx) => tx`select public.review_document(${docId}, 'approved', null, null)`),
    ).rejects.toThrow(/Enter the policy expiration date/);
    await expect(
      asUser(admin, (tx) => tx`select public.review_document(${docId}, 'approved', null, current_date - 1)`),
    ).rejects.toThrow(/has expired and cannot be approved/);

    await asUser(admin, (tx) => tx`select public.review_document(${docId}, 'approved', null, current_date + 30)`);
    const [doc] = await sql`select status from public.qualification_documents where id = ${docId}`;
    expect(doc.status).toBe("approved");
  });

  it("does not let an expired or rejected certificate count toward submission", async () => {
    const [owner, admin] = [await createUser(), await createAdmin()];
    const orgId = await createSubmittableContractor(owner);
    const docId = await glDocumentId(orgId);
    await asUser(admin, (tx) => tx`select public.review_document(${docId}, 'rejected', 'Illegible', null)`);
    await expect(
      asUser(owner, (tx) => tx`select public.submit_organization_for_review(${orgId})`),
    ).rejects.toThrow(/general liability certificate/);
  });

  it("reports insurance status to members and staff only", async () => {
    const [owner, admin, stranger] = [await createUser(), await createAdmin(), await createUser()];
    const orgId = await createSubmittableContractor(owner);
    const status = (userId: string) =>
      asUser(userId, async (tx) => (await tx<{ s: string | null }[]>`select public.organization_insurance_status(${orgId}) as s`)[0].s);

    expect(await status(owner)).toBe("pending_review");
    expect(await status(stranger)).toBeNull();
    const docId = await approveInsurance(admin, orgId);
    expect(await status(owner)).toBe("current");
    await sql`update public.qualification_documents set expires_on = current_date - 1 where id = ${docId}`;
    expect(await status(admin)).toBe("expired");
    await sql`delete from public.qualification_documents where id = ${docId}`;
    expect(await status(owner)).toBe("missing");
  });
});
