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

// Timesheets (D-038): who approves hours, the rules on adjusting them, the
// worker questioning them, and who sees what.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", async () => {
  const helpers = await import("./helpers");
  return { withUser: helpers.asUser };
});

const { approveTimesheet, listMyTimesheets, listOrgTimesheets, queryTimesheet } = await import(
  "@/server/data/timesheets"
);

afterAll(() => sql.end());

/** New York wall-clock value (YYYY-MM-DDTHH:MM) for an instant. */
const local = async (at: Date) => {
  const [{ v }] = await sql<{ v: string }[]>`
    select to_char(${at}::timestamptz at time zone 'America/New_York', 'YYYY-MM-DD"T"HH24:MI') as v
  `;
  return v;
};
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const nyToday = async () =>
  (await sql<{ d: string }[]>`select to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD') as d`)[0].d;

async function book(owner: string, worker: string, jobId: string) {
  await asUser(worker, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
  const [{ id }] = await asUser(owner, (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`);
  await asUser(worker, (tx) => tx`select public.respond_to_offer(${id}, true)`);
  return id;
}

async function setup() {
  const admin = await createAdmin();
  const owner = await createUser("Marcus Bell");
  const orgId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
  const member = await createUser("Max Member");
  await addMember(orgId, member, "member");
  const worker = await createUser("Wendy Worker");
  const other = await createUser("Omar Other");
  for (const w of [worker, other]) await createApprovedWorker(w, admin);
  const jobId = await postJob(owner, orgId, { headcount: 2, payCents: 2400 });
  const shift = await book(owner, worker, jobId);
  const otherShift = await book(owner, other, jobId);
  return { admin, owner, orgId, member, worker, other, jobId, shift, otherShift };
}

describe("timesheets", () => {
  it("are approved by dispatchers once the shift is over, as recorded or adjusted with a note", async () => {
    const s = await setup();
    // Started 9 hours ago, scheduled to end in an hour; the worker checked in on time.
    await moveJob(s.jobId, -540, 600);
    await sql`update public.job_assignments set checked_in_at = ${minutesAgo(538)} where id = ${s.shift}`;
    const asRecorded = { assignmentId: s.shift, start: await local(minutesAgo(538)), breakMinutes: 0, note: null };

    // Not before the shift ends or the worker checks out.
    await expect(approveTimesheet(s.owner, { ...asRecorded, end: await local(minutesAgo(5)) })).rejects.toThrow(
      /once the shift ends or the worker checks out/,
    );
    await sql`update public.job_assignments set checked_out_at = ${minutesAgo(4)} where id = ${s.shift}`;
    const end = await local(minutesAgo(4));

    // Only the business's dispatchers.
    await expect(approveTimesheet(s.member, { ...asRecorded, end })).rejects.toThrow(/Only owners, admins and dispatchers/);
    await expect(approveTimesheet(s.worker, { ...asRecorded, end })).rejects.toThrow(/Shift not found/);
    const outsider = await createUser("Olga Outsider");
    await expect(approveTimesheet(outsider, { ...asRecorded, end })).rejects.toThrow(/Shift not found/);

    // As recorded: no note needed. 534 minutes less a 30 minute break.
    await approveTimesheet(s.owner, { ...asRecorded, end, breakMinutes: 30 });
    const [ts] = await sql`select * from public.timesheets where assignment_id = ${s.shift}`;
    expect(ts).toMatchObject({ status: "approved", break_minutes: 30, pay_rate_cents: 2400, adjust_note: null });
    expect(ts.worked_minutes).toBeGreaterThanOrEqual(503);
    expect(ts.worked_minutes).toBeLessThanOrEqual(505);
    const [n] = await sql<{ title: string; body: string; link_path: string }[]>`
      select title, body, link_path from public.notifications where user_id = ${s.worker} and kind = 'timesheet.approved'
    `;
    expect(n).toMatchObject({ title: "Hours approved: Office floor refinish", link_path: "/app/worker/timesheets" });

    // Changing the times needs a note; bad values are refused.
    const earlier = await local(minutesAgo(64));
    await expect(approveTimesheet(s.owner, { ...asRecorded, end: earlier })).rejects.toThrow(/Add a note/);
    await expect(
      approveTimesheet(s.owner, { ...asRecorded, end: asRecorded.start, note: "x" }),
    ).rejects.toThrow(/end time must be after/);
    await expect(approveTimesheet(s.owner, { ...asRecorded, end, breakMinutes: 600 })).rejects.toThrow(
      /break must be shorter/,
    );
    await expect(
      approveTimesheet(s.owner, { ...asRecorded, end: await local(new Date(Date.now() + 120 * 60_000)), note: "late" }),
    ).rejects.toThrow(/can't be in the future/);
    await approveTimesheet(s.owner, { ...asRecorded, end: earlier, note: "Left an hour early for the second site." });
    const [again] = await sql`select worked_minutes, adjust_note from public.timesheets where assignment_id = ${s.shift}`;
    expect(again.adjust_note).toBe("Left an hour early for the second site.");
    expect(again.worked_minutes).toBeGreaterThanOrEqual(473);
    expect(again.worked_minutes).toBeLessThanOrEqual(475);

    // A worker who never checked in can be paid with a note once the shift has ended.
    await moveJob(s.jobId, -600, 480);
    const sched = await sql<{ s: Date; e: Date }[]>`select starts_at as s, ends_at as e from public.jobs where id = ${s.jobId}`;
    const noCheckIn = { assignmentId: s.otherShift, start: await local(sched[0].s), end: await local(sched[0].e), breakMinutes: 0 };
    await expect(approveTimesheet(s.owner, { ...noCheckIn, note: null })).rejects.toThrow(/Add a note/);
    await approveTimesheet(s.owner, { ...noCheckIn, note: "Forgot to check in; supervisor confirmed." });

    // Nobody writes the table directly.
    await expect(
      asUser(s.owner, (tx) => tx`update public.timesheets set worked_minutes = 999 where assignment_id = ${s.shift}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(s.worker, (tx) => tx`update public.timesheets set status = 'approved' where assignment_id = ${s.shift}`),
    ).rejects.toThrow(/permission denied/);
  });

  it("can be questioned by the worker, and are listed for the business and the worker", async () => {
    const s = await setup();
    await moveJob(s.jobId, -600, 480);
    const [{ st, en }] = await sql<{ st: Date; en: Date }[]>`select starts_at as st, ends_at as en from public.jobs where id = ${s.jobId}`;
    await sql`update public.job_assignments set checked_in_at = ${st}, checked_out_at = ${en} where id = ${s.shift}`;
    const today = await nyToday();
    const [{ d }] = await sql<{ d: string }[]>`select to_char((${st}::timestamptz at time zone 'America/New_York')::date, 'YYYY-MM-DD') as d`;

    // Before approval: the business sees both booked shifts as needing approval, with names.
    const before = await listOrgTimesheets(s.owner, s.orgId, d, today);
    expect(before.filter((r) => r.job_id === s.jobId).map((r) => [r.worker_name, r.status])).toEqual([
      ["Omar Other", null],
      ["Wendy Worker", null],
    ]);
    // Members can see the list; outsiders and workers can't.
    expect(await listOrgTimesheets(s.member, s.orgId, d, today)).toHaveLength(2);
    await expect(listOrgTimesheets(s.worker, s.orgId, d, today)).rejects.toThrow(/Business not found/);
    // The worker sees only their own shift.
    expect((await listMyTimesheets(s.worker, d, today)).map((r) => [r.assignment_id, r.status])).toEqual([[s.shift, null]]);

    await approveTimesheet(s.owner, {
      assignmentId: s.shift,
      start: await local(st),
      end: await local(en),
      breakMinutes: 30,
      note: null,
    });
    const [mine] = await listMyTimesheets(s.worker, d, today);
    expect(mine).toMatchObject({ status: "approved", worked_minutes: 450, pay_rate_cents: 2400 });
    expect(mine.organization_name).toBe("Harborline Facility Services");

    // Only the worker can question it, once, with a reason.
    await expect(queryTimesheet(s.other, s.shift, "Not mine")).rejects.toThrow(/Timesheet not found/);
    await expect(queryTimesheet(s.owner, s.shift, "Hmm wrong")).rejects.toThrow(/Timesheet not found/);
    await expect(queryTimesheet(s.worker, s.shift, "no")).rejects.toThrow(/5 to 1,000/);
    await queryTimesheet(s.worker, s.shift, "I had no break that day; we worked straight through.");
    await expect(queryTimesheet(s.worker, s.shift, "Again please")).rejects.toThrow(/already questioned/);
    const [row] = (await listOrgTimesheets(s.owner, s.orgId, d, today)).filter((r) => r.assignment_id === s.shift);
    expect(row).toMatchObject({ status: "queried", query_note: "I had no break that day; we worked straight through." });
    const dispatcherNotes = await sql`
      select title from public.notifications where user_id = ${s.owner} and kind = 'timesheet.queried'
    `;
    expect(dispatcherNotes.map((n) => n.title)).toEqual(["Hours questioned: Office floor refinish"]);
    expect(await sql`select 1 from public.notifications where user_id = ${s.member} and kind = 'timesheet.queried'`).toHaveLength(0);

    // The business approves again; the worker's question stays on record.
    await approveTimesheet(s.owner, {
      assignmentId: s.shift,
      start: await local(st),
      end: await local(en),
      breakMinutes: 0,
      note: null,
    });
    const [after] = await listMyTimesheets(s.worker, d, today);
    expect(after).toMatchObject({ status: "approved", worked_minutes: 480 });
    expect(after.query_note).toContain("no break");

    // Cancelled jobs and shifts not yet over don't appear.
    const future = await postJob(s.owner, s.orgId, { headcount: 1, startsInHours: 1 });
    await book(s.owner, s.worker, future);
    expect((await listMyTimesheets(s.worker, d, today)).map((r) => r.job_id)).not.toContain(future);
  });
});
