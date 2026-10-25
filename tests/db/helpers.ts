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
