import { afterAll, describe, expect, it, vi } from "vitest";
import {
  asUser,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createUser,
  moveJob,
  postJob,
  sql,
} from "./helpers";

// The week schedule data layer (D-033), run against the test database as
// each person, through row level security.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", async () => {
  const helpers = await import("./helpers");
  return { withUser: helpers.asUser };
});

const { getContractorSchedule, getMyAvailability, getWorkerSchedule, listBookedShiftsForCalendar } =
  await import("@/server/data/schedule");

afterAll(() => sql.end());

const localDate = async (jobId: string) => {
  const [{ d }] = await sql<{ d: string }[]>`
    select to_char(starts_at at time zone 'America/New_York', 'YYYY-MM-DD') as d from public.jobs where id = ${jobId}
  `;
  return d;
};

describe("week schedules", () => {
  it("show a contractor's jobs with crew, and each worker's own shifts and offers", async () => {
    const admin = await createAdmin();
    const owner = await createUser("Marcus Bell");
    const orgId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
    const booked = await createUser("Wendy Booked");
    const offered = await createUser("Omar Offered");
    await createApprovedWorker(booked, admin);
    await createApprovedWorker(offered, admin);

    const first = await postJob(owner, orgId, { startsInHours: 30, headcount: 2 });
    const second = await postJob(owner, orgId, { startsInHours: 54, headcount: 1 });
    const cancelled = await postJob(owner, orgId, { startsInHours: 40, headcount: 1 });
    await asUser(owner, (tx) => tx`select public.cancel_job(${cancelled}, 'Customer moved the date')`);

    await asUser(booked, (tx) => tx`select public.apply_to_job(${first}, 'Available')`);
    await asUser(offered, (tx) => tx`select public.apply_to_job(${first}, 'Available')`);
    const [{ id: bookedShift }] = await asUser(
      owner,
      (tx) => tx<{ id: string }[]>`select public.offer_job(${first}, ${booked}) as id`,
    );
    await asUser(booked, (tx) => tx`select public.respond_to_offer(${bookedShift}, true)`);
    await asUser(owner, (tx) => tx`select public.offer_job(${first}, ${offered})`);
    await asUser(offered, (tx) => tx`select public.apply_to_job(${second}, 'Available')`);

    const [d1, d2] = [await localDate(first), await localDate(second)];
    const start = d1 < d2 ? d1 : d2;
    const end = d1 < d2 ? d2 : d1;

    // The business sees both live jobs, not the cancelled one, with its crew.
    const jobs = await getContractorSchedule(owner, orgId, start, end);
    expect(jobs.map((j) => j.id)).toEqual([first, second]);
    expect(jobs[0]).toMatchObject({
      local_date: d1,
      headcount: 2,
      booked: 1,
      offered: 1,
      applicants: 0,
      status: "open",
    });
    expect(jobs[0].crew).toEqual([
      { name: "Wendy Booked", status: "accepted", checked_in_at: null, checked_out_at: null },
      { name: "Omar Offered", status: "offered", checked_in_at: null, checked_out_at: null },
    ]);
    expect(jobs[1]).toMatchObject({ booked: 0, applicants: 1, crew: [] });
    // Only that week.
    expect(await getContractorSchedule(owner, orgId, "2020-01-05", "2020-01-11")).toEqual([]);

    // Someone outside the business sees nothing, even for open jobs.
    const stranger = await createUser("Sam Stranger");
    await createApprovedWorker(stranger, admin);
    expect(await getContractorSchedule(stranger, orgId, start, end)).toEqual([]);
    expect(await getContractorSchedule(booked, orgId, start, end)).toEqual([]);

    // Each worker sees their own shifts only.
    expect(await getWorkerSchedule(booked, start, end)).toEqual([
      expect.objectContaining({
        job_id: first,
        assignment_id: bookedShift,
        status: "accepted",
        organization_name: "Harborline Facility Services",
      }),
    ]);
    expect(await getWorkerSchedule(offered, start, end)).toEqual([
      expect.objectContaining({ job_id: first, status: "offered" }),
    ]);
    expect(await getWorkerSchedule(stranger, start, end)).toEqual([]);

    // The calendar file has booked shifts with the site address, not offers.
    expect(await listBookedShiftsForCalendar(booked)).toEqual([
      expect.objectContaining({
        job_id: first,
        address_line1: "100 Carleton Ave",
        city: "Central Islip",
        postal_code: "11722",
      }),
    ]);
    expect(await listBookedShiftsForCalendar(offered)).toEqual([]);

    // An offer that was never answered drops off once the shift has started.
    await moveJob(first, -30);
    const now = await localDate(first);
    expect((await getWorkerSchedule(offered, now, now)).map((s) => s.job_id)).not.toContain(first);
    expect((await getWorkerSchedule(booked, now, now)).map((s) => s.job_id)).toContain(first);

    // Availability is the worker's own.
    expect(await getMyAvailability(booked)).toEqual([{ weekday: 6, start_time: "07:00:00", end_time: "15:00:00" }]);
    expect(await getMyAvailability(owner)).toEqual([]);
  });
});
