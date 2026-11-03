import { afterAll, describe, expect, it, vi } from "vitest";
import type { DocumentDeps } from "@/server/documents/store";
import { reconcileStorage } from "@/server/documents/store";
import { PhotoRejected, storeJobPhoto } from "@/server/jobs/photo-store";
import { StorageObjectNotFound, type FileStorage } from "@/server/storage/types";
import {
  addMember,
  asUser,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createUser,
  moveJob,
  postJob,
  sql,
} from "./helpers";

// Job photos (D-035): who may add, see and remove them, and that the row
// and the stored file stay together.
const objects = new Map<string, { bytes: Uint8Array; createdAt: Date }>();
const fail = { put: false };
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
    objects.delete(p);
  },
  async list(prefix) {
    return [...objects.entries()]
      .filter(([p]) => p.startsWith(prefix + "/"))
      .map(([p, o]) => ({ path: p, createdAt: o.createdAt }));
  },
};

vi.mock("server-only", () => ({}));
vi.mock("@/server/storage", () => ({ fileStorage: () => storage, StorageObjectNotFound }));
vi.mock("@/server/db/client", async () => {
  const helpers = await import("./helpers");
  return { withUser: helpers.asUser };
});

const { getJobPhotoForView, hideJobPhoto, listJobPhotos, uploadJobPhoto } = await import("@/server/data/job-photos");

afterAll(() => sql.end());

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);
const pdf = new TextEncoder().encode("%PDF-1.7\nx\n%%EOF");
const deps = (userId: string): DocumentDeps => ({
  run: (fn) => asUser(userId, fn),
  storage,
  onCleanupFailure: () => {},
});
const photo = (
  jobId: string,
  extra: Partial<{ caption: string; checklistItemId: string; bytes: Uint8Array }> = {},
) => ({
  jobId,
  checklistItemId: extra.checklistItemId ?? null,
  caption: extra.caption ?? null,
  fileName: "lobby.jpg",
  bytes: extra.bytes ?? jpeg,
});

async function setup() {
  const admin = await createAdmin();
  const owner = await createUser("Marcus Bell");
  const orgId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
  const member = await createUser("Max Member");
  await addMember(orgId, member, "member");
  const worker = await createUser("Wendy Worker");
  const applicant = await createUser("Andy Applicant");
  for (const w of [worker, applicant]) await createApprovedWorker(w, admin);
  const jobId = await postJob(owner, orgId, { headcount: 2 });
  await asUser(worker, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
  await asUser(applicant, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
  const [{ id: shift }] = await asUser(
    owner,
    (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`,
  );
  await asUser(worker, (tx) => tx`select public.respond_to_offer(${shift}, true)`);
  return { admin, owner, orgId, member, worker, applicant, jobId, shift };
}

describe("job photos", () => {
  it("are added by dispatchers and checked-in crew, and seen by the business, staff and crew", async () => {
    const { admin, owner, member, worker, applicant, jobId, shift } = await setup();
    const outsider = await createUser("Olga Outsider");

    // The business adds one before the day.
    const fromOwner = await uploadJobPhoto(owner, photo(jobId, { caption: "Before: lobby", bytes: png }));
    const [row] =
      await sql`select storage_path, mime_type, organization_id from public.job_photos where id = ${fromOwner}`;
    expect(row.storage_path).toBe(`job/${jobId}/${fromOwner}.png`);
    expect(row.mime_type).toBe("image/png");
    expect(objects.has(row.storage_path)).toBe(true);

    // Members, applicants, outsiders and not-yet-checked-in crew can't add.
    await expect(uploadJobPhoto(member, photo(jobId))).rejects.toThrow(/once you've checked in/);
    await expect(uploadJobPhoto(applicant, photo(jobId))).rejects.toThrow(/once you've checked in/);
    await expect(uploadJobPhoto(outsider, photo(jobId))).rejects.toThrow(/Job not found|once you've checked in/);
    await expect(uploadJobPhoto(worker, photo(jobId))).rejects.toThrow(/once you've checked in/);

    // Checked in, the crew can, including for a checklist item on this job only.
    await moveJob(jobId, -20);
    await asUser(worker, (tx) => tx`select public.check_in(${shift})`);
    const [{ id: itemId }] = await asUser(
      owner,
      (tx) => tx<{ id: string }[]>`select public.add_job_checklist_item(${jobId}, 'Wax the lobby') as id`,
    );
    const fromWorker = await uploadJobPhoto(
      worker,
      photo(jobId, { caption: "After two coats", checklistItemId: itemId }),
    );
    const otherJob = await postJob(
      owner,
      (await sql`select organization_id from public.jobs where id = ${jobId}`)[0].organization_id,
    );
    const [{ id: otherItem }] = await asUser(
      owner,
      (tx) => tx<{ id: string }[]>`select public.add_job_checklist_item(${otherJob}, 'Elsewhere') as id`,
    );
    await expect(uploadJobPhoto(worker, photo(jobId, { checklistItemId: otherItem }))).rejects.toThrow(
      /isn't on this job/,
    );

    // Who sees them: business (with names), crew (without others' names), staff; not applicants or outsiders.
    const forOwner = await listJobPhotos(owner, jobId);
    expect(forOwner.map((p) => [p.caption, p.uploaded_by_name, p.checklist_label])).toEqual([
      ["Before: lobby", "Marcus Bell", null],
      ["After two coats", "Wendy Worker", "Wax the lobby"],
    ]);
    expect((await listJobPhotos(worker, jobId)).map((p) => p.uploaded_by_name)).toEqual([null, null]);
    expect(await listJobPhotos(member, jobId)).toHaveLength(2);
    expect(await listJobPhotos(admin, jobId)).toHaveLength(2);
    expect(await listJobPhotos(applicant, jobId)).toEqual([]);
    expect(await getJobPhotoForView(outsider, fromWorker)).toBeNull();
    expect(await getJobPhotoForView(worker, fromOwner)).toMatchObject({ mime_type: "image/png" });

    // Removing: the crew can't take the business's photo off; the uploader and dispatchers can.
    await expect(hideJobPhoto(worker, fromOwner)).rejects.toThrow(/can't remove/);
    await hideJobPhoto(worker, fromWorker);
    expect((await listJobPhotos(owner, jobId)).map((p) => p.id)).toEqual([fromOwner]);
    await hideJobPhoto(owner, fromOwner);
    expect(await listJobPhotos(worker, jobId)).toEqual([]);
    // Kept on file: rows and files stay, and staff still see them.
    expect(await listJobPhotos(admin, jobId)).toEqual([]);
    expect(await getJobPhotoForView(admin, fromWorker)).not.toBeNull();
    const [{ n }] = await sql<
      { n: number }[]
    >`select count(*)::int as n from public.job_photos where job_id = ${jobId}`;
    expect(n).toBe(2);

    // After the shift (plus two hours) the crew can't add more.
    await moveJob(jobId, -720, 480);
    await expect(uploadJobPhoto(worker, photo(jobId))).rejects.toThrow(/once you've checked in/);
  });

  it("rejects non-images, keeps row and file together, and refuses forged rows", async () => {
    const { owner, orgId, jobId } = await setup();
    await expect(storeJobPhoto(deps(owner), owner, photo(jobId, { bytes: pdf }))).rejects.toThrow(PhotoRejected);
    await expect(
      storeJobPhoto(deps(owner), owner, photo(jobId, { bytes: new TextEncoder().encode("hello") })),
    ).rejects.toThrow(/JPEG or PNG/);

    fail.put = true;
    await expect(storeJobPhoto(deps(owner), owner, photo(jobId))).rejects.toThrow(/storage outage/);
    fail.put = false;
    const [{ n }] = await sql<
      { n: number }[]
    >`select count(*)::int as n from public.job_photos where job_id = ${jobId}`;
    expect(n).toBe(0);

    // Direct inserts: the organization comes from the job, the path must match, and fields can't be forged.
    const forge = (path: string, org: string) =>
      asUser(
        owner,
        (tx) => tx`
        insert into public.job_photos (id, job_id, organization_id, file_name, mime_type, size_bytes, sha256, storage_path, uploaded_by)
        values ('11111111-1111-4111-8111-111111111111', ${jobId}, ${org}, 'x.jpg', 'image/jpeg', 10, ${"a".repeat(64)}, ${path}, ${owner})
      `,
      );
    await expect(forge(`job/${jobId}/22222222-2222-4222-8222-222222222222.jpg`, orgId)).rejects.toThrow(
      /Invalid storage path/,
    );
    const other = await createUser("Other Owner");
    const otherOrg = await createApprovedContractor(other, await createAdmin(), "Other Co");
    await forge(`job/${jobId}/11111111-1111-4111-8111-111111111111.jpg`, otherOrg);
    const [forged] =
      await sql`select organization_id from public.job_photos where id = '11111111-1111-4111-8111-111111111111'`;
    expect(forged.organization_id).toBe(orgId);
    await expect(
      asUser(
        owner,
        (tx) => tx`update public.job_photos set hidden_at = null where id = '11111111-1111-4111-8111-111111111111'`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("are capped at 40 per job and cleaned up by storage reconciliation", async () => {
    const { owner, jobId } = await setup();
    for (let i = 0; i < 40; i++) await storeJobPhoto(deps(owner), owner, photo(jobId));
    await expect(storeJobPhoto(deps(owner), owner, photo(jobId))).rejects.toThrow(/up to 40 photos/);

    // An object with no row (a failed cleanup) is removed once it's old enough; real photos stay.
    const orphan = `job/${jobId}/33333333-3333-4333-8333-333333333333.jpg`;
    objects.set(orphan, { bytes: jpeg, createdAt: new Date(Date.now() - 3 * 3600_000) });
    const report = await reconcileStorage(sql, storage, { graceMinutes: 60 });
    expect(report.removedObjects).toContain(orphan);
    expect(report.rowsMissingObjects.filter((r) => r.storage_path.startsWith(`job/${jobId}/`))).toEqual([]);
    const [{ n }] = await sql<
      { n: number }[]
    >`select count(*)::int as n from public.job_photos where job_id = ${jobId}`;
    expect([...objects.keys()].filter((k) => k.startsWith(`job/${jobId}/`))).toHaveLength(n);
  });
});
