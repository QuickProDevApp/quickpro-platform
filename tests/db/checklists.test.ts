import { afterAll, describe, expect, it, vi } from "vitest";
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

// Job checklists (D-034), as each person, through row level security.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", async () => {
  const helpers = await import("./helpers");
  return { withUser: helpers.asUser };
});

const { addJobChecklistItem, listJobChecklist, removeJobChecklistItem, setJobChecklistItemDone } =
  await import("@/server/data/checklists");

afterAll(() => sql.end());

const book = async (owner: string, worker: string, jobId: string) => {
  await asUser(worker, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
  const [{ id }] = await asUser(
    owner,
    (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`,
  );
  await asUser(worker, (tx) => tx`select public.respond_to_offer(${id}, true)`);
  return id;
};

const notifications = (userId: string) =>
  sql<
    { kind: string; title: string }[]
  >`select kind, title from public.notifications where user_id = ${userId} and kind = 'job.checklist_done'`;

describe("job checklists", () => {
  it("are built by dispatchers and checked off by the crew on the day", async () => {
    const admin = await createAdmin();
    const owner = await createUser("Marcus Bell");
    const orgId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
    const dispatcher = await createUser("Dee Dispatcher");
    const member = await createUser("Max Member");
    await addMember(orgId, dispatcher, "dispatcher");
    await addMember(orgId, member, "member");
    const worker = await createUser("Wendy Worker");
    const applicant = await createUser("Andy Applicant");
    const outsider = await createUser("Olga Outsider");
    for (const w of [worker, applicant, outsider]) await createApprovedWorker(w, admin);

    const jobId = await postJob(owner, orgId, { headcount: 2 });
    const shift = await book(owner, worker, jobId);
    await asUser(applicant, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);

    // Dispatchers build the list; members and workers can't.
    const lobby = await addJobChecklistItem(dispatcher, jobId, "  Strip and wax the lobby ");
    const mats = await addJobChecklistItem(owner, jobId, "Replace entrance mats");
    const extra = await addJobChecklistItem(owner, jobId, "Clean the loading dock");
    await expect(addJobChecklistItem(member, jobId, "Windows")).rejects.toThrow(/owners, admins and dispatchers/);
    await expect(addJobChecklistItem(worker, jobId, "Windows")).rejects.toThrow(/Job not found/);
    await expect(addJobChecklistItem(owner, jobId, "   ")).rejects.toThrow(/1 to 200 characters/);

    // Removing keeps the row, marked removed.
    await removeJobChecklistItem(dispatcher, extra);
    const [kept] = await sql<
      { removed_at: Date | null }[]
    >`select removed_at from public.job_checklist_items where id = ${extra}`;
    expect(kept.removed_at).not.toBeNull();
    await expect(removeJobChecklistItem(worker, lobby)).rejects.toThrow(/not found/);

    // Who can read it: the business and the booked crew, not applicants or outsiders.
    expect((await listJobChecklist(member, jobId)).map((i) => i.label)).toEqual([
      "Strip and wax the lobby",
      "Replace entrance mats",
    ]);
    expect(await listJobChecklist(worker, jobId)).toHaveLength(2);
    expect(await listJobChecklist(applicant, jobId)).toEqual([]);
    expect(await listJobChecklist(outsider, jobId)).toEqual([]);
    await expect(setJobChecklistItemDone(applicant, lobby, true, null)).rejects.toThrow(/not found/);

    // The crew can check items off only once checked in.
    await expect(setJobChecklistItemDone(worker, lobby, true, null)).rejects.toThrow(/once you've checked in/);
    await moveJob(jobId, -20);
    await asUser(worker, (tx) => tx`select public.check_in(${shift})`);
    await setJobChecklistItemDone(worker, lobby, true, "Two coats");
    // Undo and redo.
    await setJobChecklistItemDone(worker, lobby, false, null);
    expect((await listJobChecklist(worker, jobId))[0]).toMatchObject({ done_at: null, done_by: null, done_note: null });
    await setJobChecklistItemDone(worker, lobby, true, "Two coats");
    expect(await notifications(owner)).toEqual([]);

    // The last item checked off by the crew tells the dispatchers, not members.
    await setJobChecklistItemDone(worker, mats, true, null);
    expect(await notifications(owner)).toEqual([
      { kind: "job.checklist_done", title: "Checklist complete: Office floor refinish" },
    ]);
    expect(await notifications(dispatcher)).toHaveLength(1);
    expect(await notifications(member)).toEqual([]);
    // Undoing and redoing the last item doesn't tell them again.
    await setJobChecklistItemDone(worker, mats, false, null);
    await setJobChecklistItemDone(worker, mats, true, null);
    expect(await notifications(owner)).toHaveLength(1);

    // The business sees who checked each item; the crew see that it was done, not other people's names.
    const forBusiness = await listJobChecklist(owner, jobId);
    expect(forBusiness[0]).toMatchObject({ done_by: worker, done_by_name: "Wendy Worker", done_note: "Two coats" });
    expect((await listJobChecklist(worker, jobId))[0]).toMatchObject({ done_by: worker, done_by_name: null });

    // A dispatcher can still adjust it; nobody can once the job is completed.
    await setJobChecklistItemDone(dispatcher, mats, false, null);
    await setJobChecklistItemDone(dispatcher, mats, true, "Checked on walk-through");
    expect((await listJobChecklist(owner, jobId))[1]).toMatchObject({ done_by_name: "Dee Dispatcher" });
    await moveJob(jobId, -720, 480); // ended four hours ago
    await expect(setJobChecklistItemDone(worker, mats, false, null)).rejects.toThrow(/shift has ended/);
    await asUser(worker, (tx) => tx`select public.check_out(${shift})`);
    await asUser(owner, (tx) => tx`select public.complete_job(${jobId})`);
    await expect(setJobChecklistItemDone(owner, mats, false, null)).rejects.toThrow(/completed or cancelled/);
    await expect(addJobChecklistItem(owner, jobId, "One more")).rejects.toThrow(/completed or cancelled/);

    // The tables can't be written directly.
    await expect(
      asUser(owner, (tx) => tx`update public.job_checklist_items set done_at = null where id = ${lobby}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(
        owner,
        (tx) =>
          tx`insert into public.job_checklist_items (job_id, organization_id, position, label) values (${jobId}, ${orgId}, 9, 'x')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("allow at most 30 items", async () => {
    const admin = await createAdmin();
    const owner = await createUser("Marcus Bell");
    const orgId = await createApprovedContractor(owner, admin);
    const jobId = await postJob(owner, orgId);
    for (let i = 1; i <= 30; i++) await addJobChecklistItem(owner, jobId, `Item ${i}`);
    await expect(addJobChecklistItem(owner, jobId, "Item 31")).rejects.toThrow(/up to 30/);
  });
});
