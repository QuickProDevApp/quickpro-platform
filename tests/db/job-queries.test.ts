import { afterAll, describe, expect, it, vi } from "vitest";
import type { JobInput } from "@/lib/schemas";
import { areaId, categoryId, engagementTypeId, marketplace, skillId, sql } from "./helpers";

// The app's data layer, run against the test database as each user.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", async () => {
  const helpers = await import("./helpers");
  return { withUser: helpers.asUser };
});

const jobs = await import("@/server/data/jobs");

afterAll(() => sql.end());

function newYorkOffset(d: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")!.value;
}

/**
 * A date (YYYY-MM-DD) a day or more ahead in New York whose night does not
 * cross a daylight saving change, so an overnight shift is a fixed length.
 */
function tomorrowInNewYork() {
  for (let hours = 36; hours < 36 + 24 * 7; hours += 24) {
    const d = new Date(Date.now() + hours * 3_600_000);
    if (newYorkOffset(d) === newYorkOffset(new Date(d.getTime() + 24 * 3_600_000))) {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
    }
  }
  throw new Error("No week without a daylight saving change");
}

/** Date and HH:MM in New York, `hours` from now. */
function newYorkIn(hours: number) {
  const d = new Date(Date.now() + hours * 3_600_000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date, time };
}

async function input(overrides: Partial<JobInput> = {}): Promise<JobInput> {
  return {
    title: "Retail floor scrub",
    description: "Two aisles, overnight.",
    categoryId: await categoryId("commercial-cleaning"),
    serviceAreaId: await areaId("islip"),
    date: tomorrowInNewYork(),
    startTime: "22:00",
    endTime: "04:00",
    headcount: 1,
    payRate: 2550,
    engagementTypeId: await engagementTypeId(),
    addressLine1: "1 Main St",
    city: "Bay Shore",
    postalCode: "11706",
    siteNotes: "Rear entrance",
    contactName: "Night Manager",
    contactPhone: "631-555-0101",
    ...overrides,
  };
}

describe("job data layer", () => {
  it("stores local times in New York time, including shifts past midnight", async () => {
    const { owner, orgId } = await marketplace();
    const id = await jobs.createJob(owner, orgId, await input(), [await skillId("floor-care")]);
    const job = await jobs.getJob(owner, id);
    expect(job).toMatchObject({ local_start: "22:00", local_end: "04:00", headcount: 1, pay_rate_cents: 2550 });
    expect(job!.ends_at.getTime() - job!.starts_at.getTime()).toBe(6 * 3_600_000);
    expect(job!.skill_names).toEqual(["Floor care (strip, wax, buff)"]);
    expect(await jobs.getJobSite(owner, id)).toMatchObject({ city: "Bay Shore", contact_phone: "631-555-0101" });
  });

  it("updates the job, its skills and site together", async () => {
    const { owner, orgId } = await marketplace();
    const id = await jobs.createJob(owner, orgId, await input(), [await skillId("floor-care")]);
    await jobs.updateJob(owner, id, await input({ title: "Retail floor scrub and wax", siteNotes: "Ring bell" }), [
      await skillId("general-janitorial"),
    ]);
    const job = await jobs.getJob(owner, id);
    expect(job!.title).toBe("Retail floor scrub and wax");
    expect(job!.skill_names).toEqual(["General janitorial"]);
    expect((await jobs.getJobSite(owner, id))!.site_notes).toBe("Ring bell");
  });

  it("rolls back the whole job when the site is invalid", async () => {
    const { owner, orgId } = await marketplace();
    await expect(jobs.createJob(owner, orgId, await input({ postalCode: "bad" }), [])).rejects.toThrow();
    expect(await sql`select id from public.jobs where organization_id = ${orgId}`).toHaveLength(0);
  });

  it("shows workers local jobs, their match and their progress through the flow", async () => {
    const { owner, orgId, worker } = await marketplace();
    // The approved worker's home town is Brookhaven; Islip is not one of their towns.
    const islip = await jobs.createJob(owner, orgId, await input(), [await skillId("floor-care")]);
    const brookhaven = await jobs.createJob(owner, orgId, await input({ serviceAreaId: await areaId("brookhaven"), startTime: "08:00", endTime: "12:00" }), []);

    // Other test files post jobs too; look at this business's only.
    const ours = <T extends { organization_id: string }>(list: T[]) => list.filter((j) => j.organization_id === orgId);
    const local = ours(await jobs.listOpenJobsForWorker(worker, "local"));
    expect(local.map((j) => j.id)).toEqual([brookhaven]);
    const all = ours(await jobs.listOpenJobsForWorker(worker, "all"));
    expect(all.map((j) => j.id).sort()).toEqual([islip, brookhaven].sort());
    const islipJob = all.find((j) => j.id === islip)!;
    expect(islipJob).toMatchObject({ organization_name: "Bayshore Clean Co", in_my_areas: false, matching_skills: 1 });

    await jobs.applyToJob(worker, islip, "Available");
    await jobs.offerJob(owner, islip, worker);
    let mine = await jobs.listMyWork(worker);
    expect(mine[0]).toMatchObject({ id: islip, application_status: "offered", assignment_status: "offered" });
    expect(await jobs.getJobSite(worker, islip)).toBeNull();

    await jobs.respondToOffer(worker, mine[0].assignment_id!, true);
    mine = await jobs.listMyWork(worker);
    expect(mine[0].assignment_status).toBe("accepted");
    expect(await jobs.getJobSite(worker, islip)).not.toBeNull();

    const people = await jobs.listJobPeople(owner, islip);
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ full_name: "Wes Worker", assignment_status: "accepted", phone: "631-555-0142" });
    expect((await jobs.getJob(owner, islip))!.status).toBe("filled");
  });

  it("gives staff an attention list and ranked match candidates", async () => {
    const { owner, orgId, admin, worker } = await marketplace();
    const start = newYorkIn(24);
    const end = newYorkIn(28);
    const soon = await jobs.createJob(owner, orgId, await input({
      serviceAreaId: await areaId("brookhaven"),
      date: start.date,
      startTime: start.time,
      endTime: end.time,
    }), [
      await skillId("floor-care"),
    ]);
    const attention = await jobs.listJobsForAdmin(admin, "attention");
    expect(attention.map((j) => j.id)).toContain(soon);
    const counts = await jobs.getJobCountsForAdmin(admin);
    expect(counts.unfilled_soon).toBeGreaterThanOrEqual(1);
    await jobs.offerJob(admin, soon, worker);
    const candidates = await jobs.listMatchCandidates(admin, soon);
    // Workers in the job's town with the skill come first.
    expect(candidates[0]).toMatchObject({ in_area: true, matching_skills: 1 });
    const offered = await sql<{ worker_user_id: string }[]>`select worker_user_id from public.job_assignments where job_id = ${soon}`;
    expect(offered).toEqual([{ worker_user_id: worker }]);
  });
});
