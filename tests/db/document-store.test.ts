import { afterAll, describe, expect, it } from "vitest";
import { DocumentRejected, deleteStoredDocument, reconcileStorage, storeDocument, type DocumentDeps } from "@/server/documents/store";
import { StorageObjectNotFound, type FileStorage } from "@/server/storage/types";
import { asUser, createSubmittableContractor, createUser, sql } from "./helpers";

afterAll(() => sql.end());

const pdf = new TextEncoder().encode("%PDF-1.7\nquickpro test\n%%EOF");

/** In-memory storage with switchable failures. */
function memoryStorage() {
  const objects = new Map<string, { bytes: Uint8Array; createdAt: Date }>();
  const fail = { put: false, remove: false };
  const storage: FileStorage = {
    async put(p, bytes) {
      if (fail.put) throw new Error("simulated storage outage");
      objects.set(p, { bytes, createdAt: new Date() });
    },
    async get(p) {
      const o = objects.get(p);
      if (!o) throw new StorageObjectNotFound(p);
      return o.bytes;
    },
    async remove(p) {
      if (fail.remove) throw new Error("simulated delete failure");
      objects.delete(p);
    },
    async list(prefix) {
      return [...objects.entries()].filter(([p]) => p.startsWith(prefix + "/")).map(([p, o]) => ({ path: p, createdAt: o.createdAt }));
    },
  };
  return { storage, objects, fail };
}

function depsFor(userId: string, storage: FileStorage, extra: Partial<DocumentDeps> = {}): DocumentDeps {
  return { run: (fn) => asUser(userId, fn), storage, onCleanupFailure: () => {}, ...extra };
}

const upload = { docType: "general_liability_coi" as const, title: "GL", expiresOn: "2030-01-01", fileName: "gl.pdf", bytes: pdf };

async function rowCount(orgId: string) {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.qualification_documents where organization_id = ${orgId}`;
  return n;
}

describe("storeDocument", () => {
  it("writes the row and the object together", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const mem = memoryStorage();
    const { id, objectPath } = await storeDocument(depsFor(owner, mem.storage), owner, { kind: "org", orgId }, upload);
    expect(objectPath).toBe(`org/${orgId}/${id}.pdf`);
    expect(mem.objects.has(objectPath)).toBe(true);
    const [row] = await sql`select storage_path, mime_type, sha256 from public.qualification_documents where id = ${id}`;
    expect(row).toMatchObject({ storage_path: objectPath, mime_type: "application/pdf" });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("leaves no row when the storage write fails", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const before = await rowCount(orgId);
    const mem = memoryStorage();
    mem.fail.put = true;
    await expect(storeDocument(depsFor(owner, mem.storage), owner, { kind: "org", orgId }, upload)).rejects.toThrow(/simulated storage outage/);
    expect(await rowCount(orgId)).toBe(before);
    expect(mem.objects.size).toBe(0);
  });

  it("removes the object again when the transaction fails after the write", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const before = await rowCount(orgId);
    const mem = memoryStorage();
    // Simulates a failed COMMIT: the work runs, then the transaction aborts.
    const run: DocumentDeps["run"] = (fn) =>
      sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: owner, role: "authenticated" })}, true)`;
        await tx`set local role authenticated`;
        await fn(tx as never);
        throw new Error("simulated commit failure");
      }) as never;
    await expect(storeDocument({ run, storage: mem.storage }, owner, { kind: "org", orgId }, upload)).rejects.toThrow(/simulated commit failure/);
    expect(await rowCount(orgId)).toBe(before);
    expect(mem.objects.size).toBe(0);
  });

  it("reports an orphan when cleanup also fails, and reconciliation removes it later", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const mem = memoryStorage();
    const orphans: string[] = [];
    const run: DocumentDeps["run"] = (fn) =>
      asUser(owner, async (tx) => {
        await fn(tx);
        mem.fail.remove = true;
        throw new Error("simulated commit failure");
      });
    await expect(
      storeDocument({ run, storage: mem.storage, onCleanupFailure: (p) => orphans.push(p) }, owner, { kind: "org", orgId }, upload),
    ).rejects.toThrow();
    expect(orphans).toHaveLength(1);
    expect(mem.objects.has(orphans[0])).toBe(true);

    mem.fail.remove = false;
    // Inside the grace period the object might belong to an upload still in flight.
    const early = await reconcileStorage(sql, mem.storage, { graceMinutes: 60 });
    expect(early.orphanedObjects).not.toContain(orphans[0]);
    const later = await reconcileStorage(sql, mem.storage, { graceMinutes: 60, now: new Date(Date.now() + 2 * 3600_000) });
    expect(later.removedObjects).toContain(orphans[0]);
    expect(mem.objects.has(orphans[0])).toBe(false);
  });

  it("never touches storage when row level security refuses the row", async () => {
    const [owner, stranger] = [await createUser(), await createUser()];
    const orgId = await createSubmittableContractor(owner);
    const mem = memoryStorage();
    await expect(storeDocument(depsFor(stranger, mem.storage), stranger, { kind: "org", orgId }, upload)).rejects.toThrow(/row-level security/);
    expect(mem.objects.size).toBe(0);
  });

  it("rejects files that are not PDF, JPEG or PNG before touching anything", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const mem = memoryStorage();
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    await expect(
      storeDocument(depsFor(owner, mem.storage), owner, { kind: "org", orgId }, { ...upload, bytes: html }),
    ).rejects.toBeInstanceOf(DocumentRejected);
    expect(mem.objects.size).toBe(0);
  });
});

describe("deleteStoredDocument", () => {
  it("deletes the row and the object", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const mem = memoryStorage();
    const { id, objectPath } = await storeDocument(depsFor(owner, mem.storage), owner, { kind: "org", orgId }, upload);
    expect(await deleteStoredDocument(depsFor(owner, mem.storage), id)).toEqual({ deleted: true, fileRemoved: true });
    expect(mem.objects.has(objectPath)).toBe(false);
  });

  it("keeps the row deleted and leaves an orphan for reconciliation when the object delete fails", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const mem = memoryStorage();
    const { id, objectPath } = await storeDocument(depsFor(owner, mem.storage), owner, { kind: "org", orgId }, upload);
    mem.fail.remove = true;
    expect(await deleteStoredDocument(depsFor(owner, mem.storage), id)).toEqual({ deleted: true, fileRemoved: false });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.qualification_documents where id = ${id}`;
    expect(n).toBe(0);
    mem.fail.remove = false;
    const report = await reconcileStorage(sql, mem.storage, { graceMinutes: 0, now: new Date(Date.now() + 1000) });
    expect(report.removedObjects).toContain(objectPath);
  });

  it("does nothing for documents the user may not delete", async () => {
    const [owner, stranger] = [await createUser(), await createUser()];
    const orgId = await createSubmittableContractor(owner);
    const mem = memoryStorage();
    const { id, objectPath } = await storeDocument(depsFor(owner, mem.storage), owner, { kind: "org", orgId }, upload);
    expect(await deleteStoredDocument(depsFor(stranger, mem.storage), id)).toEqual({ deleted: false, fileRemoved: false });
    expect(mem.objects.has(objectPath)).toBe(true);
  });
});

describe("reconcileStorage", () => {
  it("reports rows whose file is missing without deleting them, and supports dry runs", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    const mem = memoryStorage();
    const { id, objectPath } = await storeDocument(depsFor(owner, mem.storage), owner, { kind: "org", orgId }, upload);
    mem.objects.delete(objectPath);
    mem.objects.set(`org/${orgId}/00000000-0000-4000-8000-000000000000.pdf`, { bytes: pdf, createdAt: new Date(0) });

    const dry = await reconcileStorage(sql, mem.storage, { dryRun: true });
    expect(dry.rowsMissingObjects.map((r) => r.id)).toContain(id);
    expect(dry.orphanedObjects).toHaveLength(1);
    expect(dry.removedObjects).toHaveLength(0);
    expect(mem.objects.size).toBe(1);

    const real = await reconcileStorage(sql, mem.storage);
    expect(real.removedObjects).toHaveLength(1);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from public.qualification_documents where id = ${id}`;
    expect(n).toBe(1);
  });
});

describe("worker profile save", () => {
  it("rolls back profile fields when saving skills fails", async () => {
    const { saveWorkerProfile } = await import("@/server/queries/workers");
    const worker = await createUser();
    await asUser(worker, (tx) => tx`insert into public.worker_profiles (user_id, headline) values (${worker}, 'Original')`);
    const input = {
      headline: "Changed",
      bio: "",
      homeServiceAreaId: null,
      maxTravelMiles: 30,
      hasVehicle: true,
      hasDriversLicense: true,
      yearsExperience: 3,
      desiredHourlyRate: 2500,
    };
    await expect(
      asUser(worker, (tx) => saveWorkerProfile(tx, worker, input, ["00000000-0000-4000-8000-000000000000"], [])),
    ).rejects.toThrow(/foreign key/);
    const [row] = await sql`select headline, max_travel_miles from public.worker_profiles where user_id = ${worker}`;
    expect(row).toEqual({ headline: "Original", max_travel_miles: 15 });
  });

  it("rolls back skills and profile fields when a town is outside open markets", async () => {
    const { saveWorkerProfile } = await import("@/server/queries/workers");
    const worker = await createUser();
    await asUser(worker, (tx) => tx`insert into public.worker_profiles (user_id, headline) values (${worker}, 'Original')`);
    const [{ id: skill }] = await sql`select id from public.skills where slug = 'floor-care'`;
    const [{ id: hempstead }] = await sql`select id from public.service_areas where slug = 'hempstead'`;
    const input = {
      headline: "Changed",
      bio: "",
      homeServiceAreaId: null,
      maxTravelMiles: 30,
      hasVehicle: false,
      hasDriversLicense: false,
      yearsExperience: null,
      desiredHourlyRate: null,
    };
    await expect(asUser(worker, (tx) => saveWorkerProfile(tx, worker, input, [skill], [hempstead]))).rejects.toThrow(/not in a market/);
    const [row] = await sql`select headline from public.worker_profiles where user_id = ${worker}`;
    expect(row.headline).toBe("Original");
    const skills = await sql`select skill_id from public.worker_skills where user_id = ${worker}`;
    expect(skills).toHaveLength(0);
  });
});
