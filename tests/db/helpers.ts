import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { runAsUser, type Tx } from "@/server/db/rls";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is not set. Run `pnpm db:test:reset` first; see docs/architecture.md.");
}

/** Superuser connection: plays the role of the platform (auth server, migrations). */
export const sql = postgres(url, { onnotice: () => {}, max: 4 });

export function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>) {
  return runAsUser(sql, userId, fn);
}

export function asAnon<T>(fn: (tx: Tx) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`set local role anon`;
    return fn(tx);
  }) as Promise<T>;
}

/** Creates an auth user the way Supabase Auth would; the profile row comes from the trigger. */
export async function createUser(fullName = "Test User") {
  const id = randomUUID();
  await sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (${id}, ${`${id}@example.test`}, ${sql.json({ full_name: fullName })})
  `;
  return id;
}

export async function createAdmin() {
  const id = await createUser("Staff Member");
  await sql`update public.profiles set platform_role = 'admin' where id = ${id}`;
  return id;
}

export async function suffolkId() {
  const [row] = await sql<{ id: string }[]>`select id from public.markets where slug = 'suffolk-county-ny'`;
  return row.id;
}

export async function nassauId() {
  const [row] = await sql<{ id: string }[]>`select id from public.markets where slug = 'nassau-county-ny'`;
  return row.id;
}

export async function areaId(slug: string) {
  const [row] = await sql<{ id: string }[]>`select id from public.service_areas where slug = ${slug}`;
  return row.id;
}

export async function categoryId(slug: string) {
  const [row] = await sql<{ id: string }[]>`select id from public.service_categories where slug = ${slug}`;
  return row.id;
}

export async function skillId(slug: string) {
  const [row] = await sql<{ id: string }[]>`select id from public.skills where slug = ${slug}`;
  return row.id;
}

export function fakeDocument(scope: "org" | "worker", ownerId: string) {
  const id = randomUUID();
  return {
    id,
    file_name: "coi.pdf",
    mime_type: "application/pdf",
    size_bytes: 2048,
    sha256: "a".repeat(64),
    storage_path: `${scope}/${ownerId}/${id}.pdf`,
  };
}

/** Creates a contractor org owned by `ownerId` with everything needed to submit. */
export async function createSubmittableContractor(ownerId: string, name = "Bayshore Clean Co") {
  const market = await suffolkId();
  const category = await categoryId("commercial-cleaning");
  const area = await areaId("islip");
  return asUser(ownerId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      select public.create_organization('contractor', ${name}, ${market}) as id
    `;
    await tx`
      update public.organizations
         set legal_name = ${name + " LLC"}, phone = '631-555-0100', email = 'ops@example.test'
       where id = ${id}
    `;
    await tx`insert into public.contractor_services (organization_id, category_id) values (${id}, ${category})`;
    await tx`insert into public.contractor_service_areas (organization_id, service_area_id) values (${id}, ${area})`;
    const doc = fakeDocument("org", id);
    await tx`
      insert into public.qualification_documents
        (id, organization_id, doc_type, title, file_name, mime_type, size_bytes, sha256, storage_path, expires_on, uploaded_by)
      values
        (${doc.id}, ${id}, 'general_liability_coi', 'GL certificate', ${doc.file_name}, ${doc.mime_type},
         ${doc.size_bytes}, ${doc.sha256}, ${doc.storage_path}, current_date + 200, ${ownerId})
    `;
    return id;
  });
}

export async function glDocumentId(orgId: string) {
  const [row] = await sql<{ id: string }[]>`
    select id from public.qualification_documents
    where organization_id = ${orgId} and doc_type = 'general_liability_coi'
    order by created_at desc limit 1
  `;
  return row.id;
}

/** Staff approve the org's latest GL certificate (it must have an expiry date). */
export async function approveInsurance(adminId: string, orgId: string) {
  const docId = await glDocumentId(orgId);
  await asUser(adminId, (tx) => tx`select public.review_document(${docId}, 'approved', 'Looks right', null)`);
  return docId;
}

/** A submitted contractor with reviewed insurance, approved by staff. */
export async function createApprovedContractor(ownerId: string, adminId: string, name?: string) {
  const orgId = await createSubmittableContractor(ownerId, name);
  await asUser(ownerId, (tx) => tx`select public.submit_organization_for_review(${orgId})`);
  await approveInsurance(adminId, orgId);
  await asUser(adminId, (tx) => tx`select public.review_organization(${orgId}, 'approved', null)`);
  return orgId;
}

export async function orgStatus(orgId: string) {
  const [row] = await sql<{ status: string; rereview_reason: string | null }[]>`
    select status, rereview_reason from public.organizations where id = ${orgId}
  `;
  return row;
}

export async function workerStatus(userId: string) {
  const [row] = await sql<{ status: string; rereview_reason: string | null }[]>`
    select status, rereview_reason from public.worker_profiles where user_id = ${userId}
  `;
  return row;
}

/** A worker profile that has been submitted and approved by staff. */
export async function createApprovedWorker(userId: string, adminId: string) {
  const home = await areaId("brookhaven");
  const skill = await skillId("floor-care");
  await asUser(userId, async (tx) => {
    await tx`update public.profiles set phone = '631-555-0142' where id = ${userId}`;
    await tx`
      insert into public.worker_profiles (user_id, headline, home_service_area_id)
      values (${userId}, 'Floor care tech', ${home})
    `;
    await tx`insert into public.worker_skills (user_id, skill_id) values (${userId}, ${skill})`;
    await tx`insert into public.worker_availability (user_id, weekday, start_time, end_time) values (${userId}, 6, '07:00', '15:00')`;
    await tx`select public.submit_worker_profile_for_review()`;
  });
  await asUser(adminId, (tx) => tx`select public.review_worker_profile(${userId}, 'approved', null)`);
}
