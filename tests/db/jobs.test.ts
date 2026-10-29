import { afterAll, describe, expect, it } from "vitest";
import {
  addMember,
  areaId,
  asAnon,
  asUser,
  createApprovedContractor,
  createApprovedWorker,
  createSubmittableContractor,
  createUser,
  glDocumentId,
  jobStatus,
  marketplace,
  moveJob,
  postJob,
  sql,
} from "./helpers";

afterAll(() => sql.end());

const apply = (worker: string, jobId: string, note = "I have my own buffer.") =>
  asUser(worker, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select public.apply_to_job(${jobId}, ${note}) as id`;
    return id;
  });

const offer = (by: string, jobId: string, worker: string) =>
  asUser(by, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`;
    return id;
  });

const respond = (worker: string, assignmentId: string, accept: boolean) =>
  asUser(worker, (tx) => tx`select public.respond_to_offer(${assignmentId}, ${accept})`);

async function anotherApprovedWorker(admin: string, name = "Second Worker") {
  const id = await createUser(name);
  await createApprovedWorker(id, admin);
  return id;
}

async function hire(owner: string, worker: string, jobId: string) {
  await apply(worker, jobId);
  const assignmentId = await offer(owner, jobId, worker);
  await respond(worker, assignmentId, true);
  return assignmentId;
}

describe("posting jobs", () => {
  it("lets an approved contractor with reviewed insurance post a job", async () => {
    const { owner, orgId } = await marketplace();
    const jobId = await postJob(owner, orgId);
    expect(await jobStatus(jobId)).toBe("open");
    const [audit] = await sql<{ action: string; actor_user_id: string }[]>`
      select action, actor_user_id from public.audit_log where entity_type = 'job' and entity_id = ${jobId}
    `;
    expect(audit).toMatchObject({ action: "job.created", actor_user_id: owner });
  });

  it("refuses businesses that are not approved", async () => {
    const owner = await createUser();
    const orgId = await createSubmittableContractor(owner);
    await expect(postJob(owner, orgId)).rejects.toThrow(/must be approved by QuickPro staff/);
  });

  it("refuses once the insurance certificate has expired", async () => {
    const { owner, orgId } = await marketplace();
    await sql`update public.qualification_documents set expires_on = current_date - 1 where id = ${await glDocumentId(orgId)}`;
    await expect(postJob(owner, orgId)).rejects.toThrow(/general liability certificate has expired/);
  });

  it("enforces the town, timing and pay rules", async () => {
    const { owner, orgId } = await marketplace();
    await expect(postJob(owner, orgId, { area: "hempstead" })).rejects.toThrow(/must be in your business's market/);
    await expect(postJob(owner, orgId, { payCents: 1500 })).rejects.toThrow(/at least \$17\.00/);
    await expect(postJob(owner, orgId, { startsInHours: -1 })).rejects.toThrow(/must be in the future/);
    await expect(postJob(owner, orgId, { startsInHours: 24 * 130 })).rejects.toThrow(/up to 120 days/);
    await expect(postJob(owner, orgId, { hours: 17 })).rejects.toThrow(/check constraint/);
  });

  it("lets dispatchers post but not plain members or outsiders", async () => {
    const { owner, orgId, worker } = await marketplace();
    const dispatcher = await createUser();
    const member = await createUser();
    await addMember(orgId, dispatcher, "dispatcher");
    await addMember(orgId, member, "member");
    await expect(postJob(dispatcher, orgId)).resolves.toBeTruthy();
    await expect(postJob(member, orgId)).rejects.toThrow(/row-level security/);
    await expect(postJob(worker, orgId)).rejects.toThrow(/row-level security/);
    expect(await sql`select id from public.jobs where organization_id = ${orgId} and created_by = ${owner}`).toHaveLength(0);
    expect(await sql`select id from public.jobs where organization_id = ${orgId}`).toHaveLength(1);
  });

  it("never lets users write the status directly", async () => {
    const { owner, orgId } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await expect(
      asUser(owner, (tx) => tx`update public.jobs set status = 'completed' where id = ${jobId}`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("finding jobs", () => {
  it("shows open jobs to approved workers but keeps the address private", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);

    const seen = await asUser(worker, (tx) => tx`select id from public.jobs where id = ${jobId}`);
    expect(seen).toHaveLength(1);
    const skills = await asUser(worker, (tx) => tx`select skill_id from public.job_skills where job_id = ${jobId}`);
    expect(skills).toHaveLength(1);
    const sites = await asUser(worker, (tx) => tx`select * from public.job_sites where job_id = ${jobId}`);
    expect(sites).toHaveLength(0);
    const [{ name }] = await asUser(worker, (tx) => tx<{ name: string }[]>`
      select public.contractor_display_name(${orgId}) as name
    `);
    expect(name).toBe("Bayshore Clean Co");
  });

  it("hides jobs from unapproved workers, other businesses and signed-out visitors", async () => {
    const { owner, orgId, admin } = await marketplace();
    const jobId = await postJob(owner, orgId);
    const draftWorker = await createUser();
    await sql`insert into public.worker_profiles (user_id, headline) values (${draftWorker}, 'New')`;
    const otherOwner = await createUser();
    await createApprovedContractor(otherOwner, admin, "Other Co");

    for (const user of [draftWorker, otherOwner]) {
      expect(await asUser(user, (tx) => tx`select id from public.jobs where id = ${jobId}`)).toHaveLength(0);
    }
    await expect(asAnon((tx) => tx`select id from public.jobs`)).rejects.toThrow(/permission denied/);
    await expect(
      asUser(otherOwner, (tx) => tx`select * from public.job_people(${jobId})`),
    ).rejects.toThrow(/Job not found/);
  });

  it("stops showing a job once it starts or fills", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const filled = await postJob(owner, orgId, { headcount: 1 });
    const other = await anotherApprovedWorker(admin);
    await hire(owner, other, filled);
    const started = await postJob(owner, orgId);
    await moveJob(started, -10);
    const visible = await asUser(worker, (tx) => tx`select id from public.jobs where id in ${sql([filled, started])}`);
    expect(visible).toHaveLength(0);
  });
});

describe("applications, offers and acceptance", () => {
  it("runs the full flow and fills the job at headcount", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const second = await anotherApprovedWorker(admin);
    const jobId = await postJob(owner, orgId, { headcount: 2 });

    const firstAssignment = await hire(owner, worker, jobId);
    expect(await jobStatus(jobId)).toBe("open");

    // The accepted worker now sees the site and the contact.
    const sites = await asUser(worker, (tx) => tx`select contact_phone from public.job_sites where job_id = ${jobId}`);
    expect(sites).toEqual([{ contact_phone: "631-555-0177" }]);

    await hire(owner, second, jobId);
    expect(await jobStatus(jobId)).toBe("filled");

    const people = await asUser(owner, (tx) => tx<{ worker_user_id: string; assignment_status: string; phone: string | null; matching_skills: number }[]>`
      select worker_user_id, assignment_status, phone, matching_skills from public.job_people(${jobId})
    `);
    expect(people).toHaveLength(2);
    for (const p of people) {
      expect(p.assignment_status).toBe("accepted");
      expect(p.phone).toBe("631-555-0142");
      expect(p.matching_skills).toBe(1);
    }

    const audit = await sql<{ action: string }[]>`
      select action from public.audit_log where entity_type = 'job' and entity_id = ${jobId} order by id
    `;
    expect(audit.map((a) => a.action)).toContain("job.status.filled");
    const [first] = await sql<{ status: string }[]>`select status from public.job_assignments where id = ${firstAssignment}`;
    expect(first.status).toBe("accepted");
  });

  it("does not share the worker's phone before they accept", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await apply(worker, jobId);
    const [person] = await asUser(owner, (tx) => tx<{ phone: string | null; full_name: string }[]>`
      select phone, full_name from public.job_people(${jobId})
    `);
    expect(person).toEqual({ phone: null, full_name: "Wes Worker" });
  });

  it("refuses applications from workers who are not approved, and duplicates", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);
    const draft = await createUser();
    await sql`insert into public.worker_profiles (user_id, headline) values (${draft}, 'New')`;
    await expect(apply(draft, jobId)).rejects.toThrow(/must be approved/);
    await apply(worker, jobId);
    await expect(apply(worker, jobId)).rejects.toThrow(/already applied/);
  });

  it("lets a worker withdraw and apply again", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);
    const appId = await apply(worker, jobId);
    await asUser(worker, (tx) => tx`select public.withdraw_application(${appId})`);
    await expect(offer(owner, jobId, worker)).rejects.toThrow(/already been answered/);
    expect(await apply(worker, jobId)).toBe(appId);
    await expect(offer(owner, jobId, worker)).resolves.toBeTruthy();
  });

  it("only offers to applicants, except for QuickPro staff matching by hand", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await expect(offer(owner, jobId, worker)).rejects.toThrow(/only offer the job to workers who applied/);
    const assignmentId = await offer(admin, jobId, worker);
    await respond(worker, assignmentId, true);
    const [row] = await sql<{ status: string; application_id: string | null }[]>`
      select status, application_id from public.job_assignments where id = ${assignmentId}
    `;
    expect(row).toEqual({ status: "accepted", application_id: null });
  });

  it("does not offer more spots than the headcount", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const second = await anotherApprovedWorker(admin);
    const jobId = await postJob(owner, orgId, { headcount: 1 });
    await apply(worker, jobId);
    await apply(second, jobId);
    await offer(owner, jobId, worker);
    await expect(offer(owner, jobId, second)).rejects.toThrow(/already offered or filled/);
  });

  it("keeps members and other businesses from offering or declining", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const member = await createUser();
    await addMember(orgId, member, "member");
    const outsider = await createUser();
    await createApprovedContractor(outsider, admin, "Rival Co");
    const jobId = await postJob(owner, orgId);
    const appId = await apply(worker, jobId);
    for (const user of [member, outsider, worker]) {
      await expect(offer(user, jobId, worker)).rejects.toThrow(/Job not found/);
      await expect(
        asUser(user, (tx) => tx`select public.decline_application(${appId}, 'no')`),
      ).rejects.toThrow(/Application not found/);
    }
    // The member can still see who applied.
    expect(await asUser(member, (tx) => tx`select * from public.job_people(${jobId})`)).toHaveLength(1);
  });

  it("refuses an acceptance that overlaps another accepted job", async () => {
    const { owner, orgId, worker } = await marketplace();
    const first = await postJob(owner, orgId, { startsInHours: 48 });
    const overlapping = await postJob(owner, orgId, { startsInHours: 52 });
    await hire(owner, worker, first);
    await apply(worker, overlapping);
    const assignmentId = await offer(owner, overlapping, worker);
    await expect(respond(worker, assignmentId, true)).rejects.toThrow(/another job at that time/);
    await respond(worker, assignmentId, false);
    const [row] = await sql<{ status: string }[]>`select status from public.job_assignments where id = ${assignmentId}`;
    expect(row.status).toBe("declined");
  });

  it("refuses to accept after the business is suspended", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await apply(worker, jobId);
    const assignmentId = await offer(owner, jobId, worker);
    await asUser(admin, (tx) => tx`select public.review_organization(${orgId}, 'suspended', 'Complaint under review')`);
    await expect(respond(worker, assignmentId, true)).rejects.toThrow(/not currently approved/);
  });

  it("does not let one worker answer another's offer", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const other = await anotherApprovedWorker(admin);
    const jobId = await postJob(owner, orgId);
    await apply(worker, jobId);
    const assignmentId = await offer(owner, jobId, worker);
    await expect(respond(other, assignmentId, true)).rejects.toThrow(/Offer not found/);
    expect(await asUser(other, (tx) => tx`select id from public.job_assignments`)).toHaveLength(0);
  });
});

describe("changes after booking", () => {
  it("reopens a filled job when an assignment is cancelled", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId, { headcount: 1 });
    const assignmentId = await hire(owner, worker, jobId);
    expect(await jobStatus(jobId)).toBe("filled");
    await expect(
      asUser(worker, (tx) => tx`select public.cancel_assignment(${assignmentId}, '')`),
    ).rejects.toThrow(/short reason/);
    await asUser(worker, (tx) => tx`select public.cancel_assignment(${assignmentId}, 'Family emergency')`);
    expect(await jobStatus(jobId)).toBe("open");
    expect(await asUser(worker, (tx) => tx`select * from public.job_sites where job_id = ${jobId}`)).toHaveLength(0);
  });

  it("locks time, town and pay cuts once someone is booked, and keeps headcount above accepted", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const second = await anotherApprovedWorker(admin);
    const jobId = await postJob(owner, orgId, { headcount: 3 });
    await hire(owner, worker, jobId);
    await hire(owner, second, jobId);

    await expect(
      asUser(owner, (tx) => tx`update public.jobs set starts_at = starts_at + interval '1 hour' where id = ${jobId}`),
    ).rejects.toThrow(/Cancel their assignments/);
    const babylon = await areaId("babylon");
    await expect(
      asUser(owner, (tx) => tx`update public.jobs set service_area_id = ${babylon} where id = ${jobId}`),
    ).rejects.toThrow(/Cancel their assignments/);
    await expect(
      asUser(owner, (tx) => tx`update public.jobs set pay_rate_cents = 2000 where id = ${jobId}`),
    ).rejects.toThrow(/Cancel their assignments/);
    await expect(
      asUser(owner, (tx) => tx`update public.jobs set headcount = 1 where id = ${jobId}`),
    ).rejects.toThrow(/2 workers have already accepted/);

    await asUser(owner, (tx) => tx`update public.jobs set pay_rate_cents = 2600, description = 'Bring knee pads' where id = ${jobId}`);
    await asUser(owner, (tx) => tx`update public.jobs set headcount = 2 where id = ${jobId}`);
    expect(await jobStatus(jobId)).toBe("filled");
    await asUser(owner, (tx) => tx`update public.jobs set headcount = 4 where id = ${jobId}`);
    expect(await jobStatus(jobId)).toBe("open");
  });

  it("cancels the job and every open assignment, with a reason", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);
    const assignmentId = await hire(owner, worker, jobId);
    await expect(asUser(owner, (tx) => tx`select public.cancel_job(${jobId}, ' ')`)).rejects.toThrow(/reason/);
    await asUser(owner, (tx) => tx`select public.cancel_job(${jobId}, 'Client postponed')`);
    expect(await jobStatus(jobId)).toBe("cancelled");
    const [row] = await sql<{ status: string; cancel_reason: string }[]>`
      select status, cancel_reason from public.job_assignments where id = ${assignmentId}
    `;
    expect(row).toEqual({ status: "cancelled", cancel_reason: "Job cancelled: Client postponed" });
    await expect(
      asUser(owner, (tx) => tx`update public.jobs set title = 'Renamed job' where id = ${jobId}`),
    ).rejects.toThrow(/can no longer be edited/);
  });
});

describe("on the day", () => {
  it("records check-in and check-out within the window, then completes the job", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);
    const assignmentId = await hire(owner, worker, jobId);
    const checkIn = () => asUser(worker, (tx) => tx`select public.check_in(${assignmentId})`);
    const checkOut = () => asUser(worker, (tx) => tx`select public.check_out(${assignmentId})`);

    await expect(checkOut()).rejects.toThrow(/Check in before checking out/);
    await expect(checkIn()).rejects.toThrow(/opens an hour before/);
    await expect(asUser(owner, (tx) => tx`select public.complete_job(${jobId})`)).rejects.toThrow(/once it has started/);

    await moveJob(jobId, 30);
    await checkIn();
    await expect(checkIn()).rejects.toThrow(/already checked in/);

    await moveJob(jobId, -240);
    await checkOut();
    await asUser(owner, (tx) => tx`select public.complete_job(${jobId})`);
    expect(await jobStatus(jobId)).toBe("completed");
    const [row] = await sql<{ status: string; checked_in_at: Date; checked_out_at: Date }[]>`
      select status, checked_in_at, checked_out_at from public.job_assignments where id = ${assignmentId}
    `;
    expect(row.status).toBe("completed");
    expect(row.checked_out_at.getTime()).toBeGreaterThanOrEqual(row.checked_in_at.getTime());
  });

  it("lapses unanswered offers and refuses to complete a job nobody accepted", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const second = await anotherApprovedWorker(admin);
    const empty = await postJob(owner, orgId);
    await moveJob(empty, -60);
    await expect(asUser(owner, (tx) => tx`select public.complete_job(${empty})`)).rejects.toThrow(/Nobody accepted/);

    const jobId = await postJob(owner, orgId, { headcount: 2 });
    await hire(owner, worker, jobId);
    await apply(second, jobId);
    const pending = await offer(owner, jobId, second);
    await moveJob(jobId, -60);
    await expect(respond(second, pending, true)).rejects.toThrow(/no longer open/);
    await asUser(owner, (tx) => tx`select public.complete_job(${jobId})`);
    const [row] = await sql<{ status: string }[]>`select status from public.job_assignments where id = ${pending}`;
    expect(row.status).toBe("cancelled");
  });

  it("keeps the time and place fixed once the job has started", async () => {
    const { owner, orgId } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await moveJob(jobId, -30);
    await expect(
      asUser(owner, (tx) => tx`update public.jobs set ends_at = ends_at + interval '1 hour' where id = ${jobId}`),
    ).rejects.toThrow(/has started/);
    await asUser(owner, (tx) => tx`update public.jobs set description = 'Use the loading dock' where id = ${jobId}`);
  });
});

describe("staff", () => {
  it("can see every job and its people, and cancel on a contractor's behalf", async () => {
    const { owner, orgId, worker, admin } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await apply(worker, jobId);
    expect(await asUser(admin, (tx) => tx`select id from public.jobs where id = ${jobId}`)).toHaveLength(1);
    expect(await asUser(admin, (tx) => tx`select * from public.job_people(${jobId})`)).toHaveLength(1);
    expect(await asUser(admin, (tx) => tx`select * from public.job_sites where job_id = ${jobId}`)).toHaveLength(1);
    await asUser(admin, (tx) => tx`select public.cancel_job(${jobId}, 'Duplicate posting')`);
    expect(await jobStatus(jobId)).toBe("cancelled");
  });
});
