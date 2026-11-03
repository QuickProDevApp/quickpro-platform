import { afterAll, describe, expect, it, vi } from "vitest";
import { StorageObjectNotFound, type FileStorage } from "@/server/storage/types";
import {
  addMember,
  approvedCustomer,
  asUser,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createUser,
  postJob,
  postRequest,
  sql,
  submitQuote,
} from "./helpers";

// Sharing job photos and checklist progress with the project's customer (D-036).
const objects = new Map<string, Uint8Array>();
const storage: FileStorage = {
  async put(p, bytes) {
    objects.set(p, bytes);
  },
  async get(p) {
    const o = objects.get(p);
    if (!o) throw new StorageObjectNotFound(p);
    return o;
  },
  async remove(p) {
    objects.delete(p);
  },
  async list() {
    return [];
  },
};

vi.mock("server-only", () => ({}));
vi.mock("@/server/storage", () => ({ fileStorage: () => storage, StorageObjectNotFound }));
vi.mock("@/server/db/client", async () => {
  const helpers = await import("./helpers");
  return { withUser: helpers.asUser };
});

const { getJobPhotoForView, getPhotoSharing, hideJobPhoto, listJobPhotos, listSharedProjectPhotos, shareJobPhoto, uploadJobPhoto } =
  await import("@/server/data/job-photos");
const { listProjectChecklists } = await import("@/server/data/requests");

afterAll(() => sql.end());

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);
const upload = (userId: string, jobId: string, caption: string) =>
  uploadJobPhoto(userId, { jobId, checklistItemId: null, caption, fileName: "site.jpg", bytes: jpeg });

const notices = async (userId: string) =>
  (await sql<{ kind: string; title: string }[]>`
    select kind, title from public.notifications where user_id = ${userId} and kind = 'project.photos_shared'
  `).map((n) => n.title);

/** A project awarded to a prime, a subcontractor working on it, a rival that lost, and a crew member. */
async function project() {
  const admin = await createAdmin();
  const customer = await approvedCustomer(admin);
  const viewer = await createUser("Vic Viewer");
  await addMember(customer.orgId, viewer, "member");
  const owner = await createUser("Marcus Bell");
  const primeId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
  const member = await createUser("Max Member");
  await addMember(primeId, member, "member");
  const rivalOwner = await createUser("Rita Rival");
  const rivalId = await createApprovedContractor(rivalOwner, admin, "Rival Cleaning");
  const subOwner = await createUser("Sofia Reyes");
  const subId = await createApprovedContractor(subOwner, admin, "Reyes Window Works");
  const worker = await createUser("Wes Worker");
  await createApprovedWorker(worker, admin);

  const requestId = await postRequest(customer.owner, customer.orgId);
  const won = await submitQuote(owner, requestId, primeId, 320000);
  await submitQuote(rivalOwner, requestId, rivalId, 290000);
  await asUser(customer.owner, (tx) => tx`select public.accept_quote(${won})`);
  const jobId = await postJob(owner, primeId, { requestId, headcount: 1 });

  const [{ id: sc }] = await asUser(
    owner,
    (tx) => tx<{ id: string }[]>`
      select public.offer_subcontract(${requestId}, ${subId}, 'Exterior windows on all floors.', 85000) as id
    `,
  );
  await asUser(subOwner, (tx) => tx`select public.respond_to_subcontract(${sc}, true, null)`);
  const subJob = await postJob(subOwner, subId, { requestId, headcount: 1 });
  return { admin, customer, viewer, owner, primeId, member, rivalOwner, subOwner, subId, worker, requestId, jobId, subJob };
}

describe("shared job photos", () => {
  it("are chosen by the awarded contractor's dispatchers and shown to the customer", async () => {
    const p = await project();
    const lobby = await upload(p.owner, p.jobId, "Lobby after the second coat");
    const office = await upload(p.owner, p.jobId, "Back office");

    // New photos start private; the customer can't open them.
    expect(await listSharedProjectPhotos(p.customer.owner, p.requestId)).toEqual([]);
    expect(await getJobPhotoForView(p.customer.owner, lobby)).toBeNull();
    expect((await listJobPhotos(p.owner, p.jobId)).map((x) => x.shared_at)).toEqual([null, null]);

    // Only the prime's dispatchers can share, and only on project jobs.
    expect(await getPhotoSharing(p.owner, p.jobId)).toBe("Harbor Office Park");
    expect(await getPhotoSharing(p.member, p.jobId)).toBeNull();
    await expect(shareJobPhoto(p.member, lobby, true)).rejects.toThrow(/Only owners, admins and dispatchers/);
    await expect(shareJobPhoto(p.customer.owner, lobby, true)).rejects.toThrow(/Photo not found/);
    await expect(shareJobPhoto(p.rivalOwner, lobby, true)).rejects.toThrow(/Photo not found/);
    const ownJob = await postJob(p.owner, p.primeId);
    expect(await getPhotoSharing(p.owner, ownJob)).toBeNull();
    const ownPhoto = await upload(p.owner, ownJob, "Not a project");
    await expect(shareJobPhoto(p.owner, ownPhoto, true)).rejects.toThrow(/customer project/);

    // Subcontractors can't share their photos with the prime's customer.
    expect(await getPhotoSharing(p.subOwner, p.subJob)).toBeNull();
    const subPhoto = await upload(p.subOwner, p.subJob, "Windows");
    await expect(shareJobPhoto(p.subOwner, subPhoto, true)).rejects.toThrow(/customer project/);

    // Sharing is a database function; the columns can't be written directly.
    await expect(
      asUser(p.owner, (tx) => tx`update public.job_photos set shared_at = now() where id = ${lobby}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(
        p.owner,
        (tx) => tx`
          insert into public.job_photos (id, job_id, organization_id, file_name, mime_type, size_bytes, sha256, storage_path, uploaded_by, shared_at)
          values (gen_random_uuid(), ${p.jobId}, ${p.primeId}, 'x.jpg', 'image/jpeg', 1, ${"a".repeat(64)}, 'job/x/x.jpg', ${p.owner}, now())
        `,
      ),
    ).rejects.toThrow(/permission denied/);

    await shareJobPhoto(p.owner, lobby, true);
    await shareJobPhoto(p.owner, lobby, true); // again: no change, no second notice
    const shared = await listSharedProjectPhotos(p.customer.owner, p.requestId);
    expect(shared).toEqual([
      expect.objectContaining({ id: lobby, job_id: p.jobId, caption: "Lobby after the second coat", checklist_label: null }),
    ]);
    expect(Object.keys(shared[0])).not.toContain("uploaded_by");
    // Every customer member can view it; the private one stays private.
    expect(await getJobPhotoForView(p.viewer, lobby)).toMatchObject({ mime_type: "image/jpeg" });
    expect(await getJobPhotoForView(p.customer.owner, office)).toBeNull();
    // The prime and staff see what was shared; the rival and the worker don't.
    expect((await listSharedProjectPhotos(p.owner, p.requestId)).map((x) => x.id)).toEqual([lobby]);
    expect((await listSharedProjectPhotos(p.admin, p.requestId)).map((x) => x.id)).toEqual([lobby]);
    await expect(listSharedProjectPhotos(p.rivalOwner, p.requestId)).rejects.toThrow(/Request not found/);
    await expect(listSharedProjectPhotos(p.worker, p.requestId)).rejects.toThrow(/Request not found/);
    expect(await getJobPhotoForView(p.rivalOwner, lobby)).toBeNull();

    // The customer's dispatchers are told once in six hours; plain members aren't.
    await shareJobPhoto(p.owner, office, true);
    expect(await notices(p.customer.owner)).toEqual(["New photos: Nightly office cleaning"]);
    expect(await notices(p.viewer)).toEqual([]);

    // Stop sharing, or take the photo off the job: the customer loses it.
    await shareJobPhoto(p.owner, office, false);
    expect(await getJobPhotoForView(p.customer.owner, office)).toBeNull();
    await hideJobPhoto(p.owner, lobby);
    expect(await listSharedProjectPhotos(p.customer.owner, p.requestId)).toEqual([]);
    expect(await getJobPhotoForView(p.customer.owner, lobby)).toBeNull();
    await expect(shareJobPhoto(p.owner, lobby, true)).rejects.toThrow(/Photo not found/);

    // The change is in the audit log.
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.audit_log where entity_type = 'job_photo' and entity_id = ${office} and action = 'job_photo.updated'
    `;
    expect(n).toBe(2);
  });

  it("show the customer each job's checklist progress, without names or notes", async () => {
    const p = await project();
    const add = (userId: string, jobId: string, label: string) =>
      asUser(userId, async (tx) => {
        const [{ id }] = await tx<{ id: string }[]>`select public.add_job_checklist_item(${jobId}, ${label}) as id`;
        return id;
      });
    const wax = await add(p.owner, p.jobId, "Wax the lobby");
    const mats = await add(p.owner, p.jobId, "Replace the mats");
    const gone = await add(p.owner, p.jobId, "Taken off");
    await add(p.subOwner, p.subJob, "Exterior windows, north side");
    await asUser(p.owner, (tx) => tx`select public.set_job_checklist_item_done(${wax}, true, 'Two coats')`);
    await asUser(p.owner, (tx) => tx`select public.remove_job_checklist_item(${gone})`);

    const forCustomer = await listProjectChecklists(p.customer.owner, p.requestId);
    expect(forCustomer.map((i) => [i.job_id, i.label, !!i.done_at])).toEqual([
      [p.jobId, "Wax the lobby", true],
      [p.jobId, "Replace the mats", false],
      [p.subJob, "Exterior windows, north side", false],
    ]);
    expect(Object.keys(forCustomer[0]).sort()).toEqual(["done_at", "item_id", "job_id", "label"]);
    expect(forCustomer.find((i) => i.item_id === mats)?.done_at).toBeNull();

    // The prime sees them all; a subcontractor sees only its own jobs; outsiders nothing.
    expect(await listProjectChecklists(p.owner, p.requestId)).toHaveLength(3);
    expect((await listProjectChecklists(p.subOwner, p.requestId)).map((i) => i.label)).toEqual([
      "Exterior windows, north side",
    ]);
    await expect(listProjectChecklists(p.rivalOwner, p.requestId)).rejects.toThrow(/Request not found/);
    await expect(listProjectChecklists(p.worker, p.requestId)).rejects.toThrow(/Request not found/);
  });
});
