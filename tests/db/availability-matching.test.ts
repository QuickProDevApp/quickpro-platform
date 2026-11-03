import { afterAll, describe, expect, it, vi } from "vitest";
import {
  asUser,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createUser,
  postJob,
  sql,
} from "./helpers";

// Availability matching (D-037): does a shift sit inside a worker's weekly
// hours, and are they booked elsewhere then; and who may ask.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", async () => {
  const helpers = await import("./helpers");
  return { withUser: helpers.asUser };
});

const { listJobPeople, listMatchCandidates, listOpenJobsForWorker, getJobForWorker } = await import(
  "@/server/data/jobs"
);

afterAll(() => sql.end());

/**
 * Puts a job on a weekday two to three weeks out (0 = Sunday), from `start`
 * to `end` New York time; `end` before `start` runs past midnight.
 */
async function schedule(jobId: string, weekday: number, start: string, end: string) {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`
      with d as (
        select (current_date + 14 + ((${weekday} - extract(dow from current_date + 14)::int + 7) % 7))::date as day
      )
      update public.jobs
         set starts_at = ((select day from d) + ${start}::time) at time zone 'America/New_York',
             ends_at = ((select day from d) + ${end}::time
                        + case when ${end}::time <= ${start}::time then interval '1 day' else interval '0' end)
                       at time zone 'America/New_York'
       where id = ${jobId}
    `;
  });
}

const fit = (asId: string, workerId: string, jobId: string) =>
  asUser(asId, async (tx) => {
    const [r] = await tx<{ fits: boolean | null; busy: boolean | null }[]>`
      select app.job_fits_availability(${workerId}, ${jobId}) as fits, app.booked_elsewhere(${workerId}, ${jobId}) as busy
    `;
    return r;
  });

async function book(owner: string, worker: string, jobId: string) {
  await asUser(worker, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
  const [{ id }] = await asUser(owner, (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`);
  await asUser(worker, (tx) => tx`select public.respond_to_offer(${id}, true)`);
}

describe("availability matching", () => {
  it("compares the shift with the worker's weekly hours, including windows that touch", async () => {
    const admin = await createAdmin();
    const owner = await createUser("Marcus Bell");
    const orgId = await createApprovedContractor(owner, admin);
    const worker = await createUser("Wendy Worker");
    await createApprovedWorker(worker, admin); // Saturdays 07:00-15:00
    await sql`
      insert into public.worker_availability (user_id, weekday, start_time, end_time)
      values (${worker}, 0, '07:00', '12:00'), (${worker}, 0, '12:00', '17:00')
    `;
    const job = await postJob(owner, orgId, { headcount: 1 });
    const cases: [number, string, string, boolean][] = [
      [6, "08:00", "12:00", true], // inside Saturday
      [6, "07:00", "15:00", true], // exactly the window
      [6, "06:00", "10:00", false], // starts too early
      [6, "12:00", "16:00", false], // ends too late
      [0, "09:00", "15:00", true], // Sunday, across two touching windows
      [1, "09:00", "12:00", false], // Monday: no availability
      [6, "22:00", "02:00", false], // overnight never fits
    ];
    for (const [day, start, end, expected] of cases) {
      await schedule(job, day, start, end);
      expect((await fit(worker, worker, job)).fits, `${day} ${start}-${end}`).toBe(expected);
    }
  });

  it("flags a clash with another booked shift, and shows only to the worker, staff and the business they applied to", async () => {
    const admin = await createAdmin();
    const owner = await createUser("Marcus Bell");
    const orgId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
    const otherOwner = await createUser("Rita Rival");
    const otherOrg = await createApprovedContractor(otherOwner, admin, "Rival Cleaning");
    const worker = await createUser("Wendy Worker");
    const free = await createUser("Frank Free");
    const stranger = await createUser("Sam Stranger");
    for (const w of [worker, free, stranger]) {
      await createApprovedWorker(w, admin);
      // Working in the job's town puts them at the top of staff matching.
      await sql`insert into public.worker_service_areas (user_id, service_area_id)
                select ${w}, id from public.service_areas where slug = 'islip'`;
    }

    // The worker is booked with the rival on Saturday morning.
    const booked = await postJob(otherOwner, otherOrg, { headcount: 1 });
    await schedule(booked, 6, "08:00", "12:00");
    await book(otherOwner, worker, booked);

    // This business's job overlaps it; another fits but doesn't overlap; one is outside hours.
    const clash = await postJob(owner, orgId, { headcount: 2 });
    await schedule(clash, 6, "10:00", "14:00");
    const later = await postJob(owner, orgId, { headcount: 1 });
    await schedule(later, 6, "12:00", "15:00");
    const monday = await postJob(owner, orgId, { headcount: 1 });
    await schedule(monday, 1, "09:00", "12:00");

    // The worker sees it for themselves; the booked job itself is not a clash.
    expect(await fit(worker, worker, clash)).toEqual({ fits: true, busy: true });
    expect(await fit(worker, worker, later)).toEqual({ fits: true, busy: false });
    expect(await fit(worker, worker, booked)).toEqual({ fits: true, busy: false });

    // The business can't ask about a worker who hasn't applied; other workers can't either.
    expect(await fit(owner, worker, clash)).toEqual({ fits: null, busy: null });
    expect(await fit(stranger, worker, clash)).toEqual({ fits: null, busy: null });

    // Once they apply, the business sees it on the applicant list.
    await asUser(worker, (tx) => tx`select public.apply_to_job(${clash}, 'Available')`);
    await asUser(free, (tx) => tx`select public.apply_to_job(${clash}, 'Available')`);
    const people = await listJobPeople(owner, clash);
    expect(
      people.map((p) => [p.full_name, p.fits_availability, p.booked_elsewhere]).sort(),
    ).toEqual([
      ["Frank Free", true, false],
      ["Wendy Worker", true, true],
    ]);
    // ...but not for its other jobs, and the rival can't see this job's applicants' fit.
    expect(await fit(owner, worker, later)).toEqual({ fits: null, busy: null });
    expect(await fit(otherOwner, free, clash)).toEqual({ fits: null, busy: null });

    // Staff matching puts free workers within their hours first.
    const candidates = await listMatchCandidates(admin, clash);
    const ours: string[] = [worker, free, stranger];
    const order = candidates.filter((c) => ours.includes(c.user_id));
    expect(order).toHaveLength(3);
    expect(order.find((c) => c.user_id === worker)).toMatchObject({ fits_availability: true, booked_elsewhere: true });
    expect(order.at(-1)?.user_id).toBe(worker);

    // The worker's job list can show only shifts that fit and don't clash.
    const fitting = (await listOpenJobsForWorker(worker, "all", true)).map((j) => j.id);
    expect(fitting).toContain(later);
    expect(fitting).not.toContain(clash);
    expect(fitting).not.toContain(monday);
    const all = (await listOpenJobsForWorker(worker, "all")).map((j) => j.id);
    expect(all).toEqual(expect.arrayContaining([clash, later, monday]));
    expect(await getJobForWorker(worker, monday)).toMatchObject({ fits_availability: false, booked_elsewhere: false });
  });
});
