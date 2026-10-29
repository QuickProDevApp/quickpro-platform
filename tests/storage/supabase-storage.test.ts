import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAsUser } from "@/server/db/rls";
import { deleteStoredDocument, reconcileStorage, storeDocument, type DocumentDeps } from "@/server/documents/store";
import { createSupabaseStorage } from "@/server/storage/supabase-storage";
import { DOCUMENTS_BUCKET, StorageObjectNotFound, type FileStorage } from "@/server/storage/types";

// Runs against a real Supabase stack (Auth + Storage + Postgres with the
// migrations applied), e.g. `pnpm supabase start`. Needs:
//   STORAGE_TEST_SUPABASE_URL, STORAGE_TEST_SERVICE_ROLE_KEY,
//   STORAGE_TEST_ANON_KEY, STORAGE_TEST_DATABASE_URL
const env = {
  url: process.env.STORAGE_TEST_SUPABASE_URL,
  serviceKey: process.env.STORAGE_TEST_SERVICE_ROLE_KEY,
  anonKey: process.env.STORAGE_TEST_ANON_KEY,
  databaseUrl: process.env.STORAGE_TEST_DATABASE_URL,
};
const configured = Object.values(env).every(Boolean);
if (!configured) {
  console.warn("Skipping Supabase Storage tests: set STORAGE_TEST_SUPABASE_URL, STORAGE_TEST_SERVICE_ROLE_KEY, STORAGE_TEST_ANON_KEY and STORAGE_TEST_DATABASE_URL.");
}

const pdf = new TextEncoder().encode(`%PDF-1.7\nquickpro storage test ${randomUUID()}\n%%EOF`);

describe.skipIf(!configured)("Supabase Storage", () => {
  const sql = postgres(env.databaseUrl ?? "", { prepare: false, max: 2, onnotice: () => {} });
  let storage: FileStorage;
  let userId: string;
  let orgId: string;
  let accessToken: string;
  const email = `storage-${randomUUID()}@example.test`;
  const password = randomUUID();
  const deps = (): DocumentDeps => ({ run: (fn) => runAsUser(sql, userId, fn), storage });

  beforeAll(async () => {
    storage = createSupabaseStorage(env.url!, env.serviceKey!);
    const res = await fetch(`${env.url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: env.serviceKey!, authorization: `Bearer ${env.serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Storage Test" },
      }),
    });
    expect(res.ok, await res.clone().text()).toBe(true);
    userId = (await res.json()).id;
    const signIn = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: env.anonKey!, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    accessToken = (await signIn.json()).access_token;
    expect(accessToken).toBeTruthy();
    const [{ id: market }] = await sql`select id from public.markets where slug = 'suffolk-county-ny'`;
    orgId = await runAsUser(sql, userId, async (tx) => {
      const [row] = await tx`select public.create_organization('contractor', ${"Storage Test " + randomUUID().slice(0, 8)}, ${market}) as id`;
      return row.id as string;
    });
  });

  afterAll(async () => {
    if (userId) {
      if (orgId) await sql`delete from public.organizations where id = ${orgId}`;
      await fetch(`${env.url}/auth/v1/admin/users/${userId}`, {
        method: "DELETE",
        headers: { apikey: env.serviceKey!, authorization: `Bearer ${env.serviceKey}` },
      });
    }
    await sql.end();
  });

  it("uploads, downloads and deletes a document through the real Storage API", async () => {
    const upload = { docType: "general_liability_coi" as const, title: "GL", expiresOn: "2030-01-01", fileName: "gl.pdf", bytes: pdf };
    const { id, objectPath } = await storeDocument(deps(), userId, { kind: "org", orgId }, upload);

    expect(await storage.get(objectPath)).toEqual(pdf);
    const listed = await storage.list(`org/${orgId}`);
    expect(listed.map((o) => o.path)).toEqual([objectPath]);
    expect(listed[0].createdAt).toBeInstanceOf(Date);

    expect(await deleteStoredDocument(deps(), id)).toEqual({ deleted: true, fileRemoved: true });
    await expect(storage.get(objectPath)).rejects.toBeInstanceOf(StorageObjectNotFound);
    expect(await storage.list(`org/${orgId}`)).toEqual([]);
  });

  it("does not overwrite an existing object", async () => {
    const objectPath = `org/${orgId}/${randomUUID()}.pdf`;
    await storage.put(objectPath, pdf, "application/pdf");
    await expect(storage.put(objectPath, pdf, "application/pdf")).rejects.toThrow(/Storage upload failed/);
    await storage.remove(objectPath);
  });

  it("refuses the anon key and signed-in users: the bucket has no client policies", async () => {
    const objectPath = `org/${orgId}/${randomUUID()}.pdf`;
    await storage.put(objectPath, pdf, "application/pdf");
    const anon = await fetch(`${env.url}/storage/v1/object/${DOCUMENTS_BUCKET}/${objectPath}`, {
      headers: { apikey: env.anonKey!, authorization: `Bearer ${env.anonKey}` },
    });
    expect(anon.ok).toBe(false);
    // Even the owner of the document cannot reach the bucket directly; downloads go through /api/documents.
    const owner = await fetch(`${env.url}/storage/v1/object/${DOCUMENTS_BUCKET}/${objectPath}`, {
      headers: { apikey: env.anonKey!, authorization: `Bearer ${accessToken}` },
    });
    expect(owner.ok).toBe(false);
    const ownerList = await fetch(`${env.url}/storage/v1/object/list/${DOCUMENTS_BUCKET}`, {
      method: "POST",
      headers: { apikey: env.anonKey!, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ prefix: `org/${orgId}` }),
    });
    expect(ownerList.ok ? await ownerList.json() : []).toEqual([]);
    const publicUrl = await fetch(`${env.url}/storage/v1/object/public/${DOCUMENTS_BUCKET}/${objectPath}`);
    expect(publicUrl.ok).toBe(false);
    const anonUpload = await fetch(`${env.url}/storage/v1/object/${DOCUMENTS_BUCKET}/org/${orgId}/${randomUUID()}.pdf`, {
      method: "POST",
      headers: { apikey: env.anonKey!, authorization: `Bearer ${env.anonKey}`, "content-type": "application/pdf" },
      body: pdf,
    });
    expect(anonUpload.ok).toBe(false);
    await storage.remove(objectPath);
  });

  it("enforces the bucket's file type and size limits", async () => {
    await expect(
      storage.put(`org/${orgId}/${randomUUID()}.html`, new TextEncoder().encode("<html>"), "text/html"),
    ).rejects.toThrow(/Storage upload failed/);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await expect(storage.put(`org/${orgId}/${randomUUID()}.pdf`, big, "application/pdf")).rejects.toThrow(/Storage upload failed/);
  });

  it("reports a missing object as not found", async () => {
    await expect(storage.get(`org/${orgId}/${randomUUID()}.pdf`)).rejects.toBeInstanceOf(StorageObjectNotFound);
  });

  it("finds and removes orphaned objects, and reports rows whose file is gone", async () => {
    const orphan = `org/${orgId}/${randomUUID()}.pdf`;
    await storage.put(orphan, pdf, "application/pdf");
    const upload = { docType: "other" as const, title: "Other", expiresOn: null, fileName: "x.pdf", bytes: pdf };
    const { id, objectPath } = await storeDocument(deps(), userId, { kind: "org", orgId }, upload);
    await storage.remove(objectPath);

    const later = new Date(Date.now() + 2 * 3600_000);
    const dry = await reconcileStorage(sql, storage, { dryRun: true, now: later });
    expect(dry.orphanedObjects).toContain(orphan);
    expect(dry.rowsMissingObjects.map((r) => r.id)).toContain(id);
    expect(await storage.get(orphan)).toEqual(pdf);

    const real = await reconcileStorage(sql, storage, { now: later });
    expect(real.removedObjects).toContain(orphan);
    await expect(storage.get(orphan)).rejects.toBeInstanceOf(StorageObjectNotFound);
    await sql`delete from public.qualification_documents where id = ${id}`;
  });
});
