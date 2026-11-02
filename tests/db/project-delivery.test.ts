import { afterAll, describe, expect, it } from "vitest";
import {
  approvedCustomer,
  asUser,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createUser,
  jobStatus,
  moveJob,
  postJob,
  postRequest,
  sql,
  submitQuote,
} from "./helpers";

afterAll(() => sql.end());

const kindsFor = async (userId: string, linkPart: string) =>
  (await sql<{ kind: string }[]>`
    select kind from public.notifications where user_id = ${userId} and link_path like ${"%" + linkPart} order by created_at, id
  `).map((n) => n.kind);

const requestRow = async (id: string) =>
  (await sql<{ status: string; work_completed_at: Date | null; confirmed_by: string | null }[]>`
    select status, work_completed_at, confirmed_by from public.service_requests where id = ${id}
  `)[0];

/** A customer request awarded to a contractor, plus a rival contractor that quoted and lost, and an approved worker. */
async function awardedProject() {
  const admin = await createAdmin();
  const customer = await approvedCustomer(admin);
  const contractorOwner = await createUser("Marcus Bell");
  const contractorId = await createApprovedContractor(contractorOwner, admin, "Harborline Facility Services");
  const rivalOwner = await createUser("Rita Rival");
  const rivalId = await createApprovedContractor(rivalOwner, admin, "Rival Cleaning");
  const worker = await createUser("Wes Worker");
  await createApprovedWorker(worker, admin);

  const requestId = await postRequest(customer.owner, customer.orgId);
  const winning = await submitQuote(contractorOwner, requestId, contractorId, 320000);
  await submitQuote(rivalOwner, requestId, rivalId, 290000);
  await asUser(customer.owner, (tx) => tx`select public.accept_quote(${winning})`);
  return { admin, customer, contractorOwner, contractorId, rivalOwner, rivalId, worker, requestId };
}

/** The worker applies, is offered the job and accepts. Returns the assignment id. */
async function book(contractorOwner: string, worker: string, jobId: string) {
  await asUser(worker, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
  const [{ id }] = await asUser(contractorOwner, (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`);
  await asUser(worker, (tx) => tx`select public.respond_to_offer(${id}, true)`);
  return id;
}

describe("project delivery", () => {
  it("lets only the awarded contractor schedule jobs for a project, while it is in progress", async () => {
    const admin = await createAdmin();
    const customer = await approvedCustomer(admin);
    const owner = await createUser("Marcus Bell");
    const contractorId = await createApprovedContractor(owner, admin);
    const requestId = await postRequest(customer.owner, customer.orgId);
    const q = await submitQuote(owner, requestId, contractorId);

    // Not awarded yet.
    await expect(postJob(owner, contractorId, { requestId })).rejects.toThrow(/awarded to your business/);
    await asUser(customer.owner, (tx) => tx`select public.accept_quote(${q})`);

    const rivalOwner = await createUser("Rita Rival");
    const rivalId = await createApprovedContractor(rivalOwner, admin, "Rival Cleaning");
    await expect(postJob(rivalOwner, rivalId, { requestId })).rejects.toThrow(/awarded to your business/);

    const jobId = await postJob(owner, contractorId, { requestId });
    const [{ service_request_id }] = await sql`select service_request_id from public.jobs where id = ${jobId}`;
    expect(service_request_id).toBe(requestId);

    // The link is not editable, and jobs without a project still work.
    await expect(
      asUser(owner, (tx) => tx`update public.jobs set service_request_id = null where id = ${jobId}`),
    ).rejects.toThrow(/permission denied/);
    await expect(postJob(owner, contractorId)).resolves.toBeTruthy();
  });

  it("runs from award to confirmed completion, with the customer following the work", async () => {
    const p = await awardedProject();
    const jobId = await postJob(p.contractorOwner, p.contractorId, { requestId: p.requestId, headcount: 1 });
    const assignmentId = await book(p.contractorOwner, p.worker, jobId);

    // The customer sees the job and its staffing, but not the job itself.
    const jobsFor = (userId: string) => asUser(userId, (tx) => tx`select * from public.request_jobs(${p.requestId})`);
    const [seen] = await jobsFor(p.customer.owner);
    expect(seen).toMatchObject({ id: jobId, status: "filled", headcount: 1, booked: 1, checked_in: 0, checked_out: 0 });
    expect(await asUser(p.customer.owner, (tx) => tx`select id from public.jobs where id = ${jobId}`)).toHaveLength(0);

    // Reporting complete waits for the jobs.
    const report = (userId: string, note = "All three floors done.") =>
      asUser(userId, (tx) => tx`select public.report_request_work_complete(${p.requestId}, ${note})`);
    await expect(report(p.contractorOwner)).rejects.toThrow(/Complete or cancel the 1 job still open/);

    // The day of the job: the worker checks in and out.
    await moveJob(jobId, -30, 240);
    await asUser(p.worker, (tx) => tx`select public.check_in(${assignmentId})`);
    await asUser(p.worker, (tx) => tx`select public.check_out(${assignmentId})`);
    const attendance = await asUser(p.customer.owner, (tx) => tx`select * from public.request_attendance(${p.requestId})`);
    expect(attendance).toEqual([
      expect.objectContaining({ job_id: jobId, worker_name: "Wes Worker", status: "accepted", checked_in_at: expect.any(Date), checked_out_at: expect.any(Date) }),
    ]);
    expect(Object.keys(attendance[0])).not.toContain("phone");

    await asUser(p.contractorOwner, (tx) => tx`select public.complete_job(${jobId})`);
    expect(await jobStatus(jobId)).toBe("completed");

    // The customer can't report, and can't confirm before the contractor reports.
    await expect(report(p.customer.owner)).rejects.toThrow(/Request not found/);
    await expect(asUser(p.customer.owner, (tx) => tx`select public.confirm_request_completion(${p.requestId})`)).rejects.toThrow(
      /hasn't reported the work complete/,
    );

    await report(p.contractorOwner);
    expect((await requestRow(p.requestId)).work_completed_at).toBeInstanceOf(Date);
    expect(await kindsFor(p.customer.owner, `/requests/${p.requestId}`)).toContain("request.work_complete");
    await expect(report(p.contractorOwner)).rejects.toThrow(/already reported/);
    await expect(postJob(p.contractorOwner, p.contractorId, { requestId: p.requestId })).rejects.toThrow(/send it back/);

    // The customer sends it back once, then confirms.
    const reopen = (reason: string) => asUser(p.customer.owner, (tx) => tx`select public.reopen_request_work(${p.requestId}, ${reason})`);
    await expect(reopen("  ")).rejects.toThrow(/what still needs doing/);
    await reopen("The third-floor kitchen was missed.");
    expect((await requestRow(p.requestId)).work_completed_at).toBeNull();
    expect(await kindsFor(p.contractorOwner, `/requests/${p.requestId}`)).toContain("request.work_reopened");
    await report(p.contractorOwner, "Kitchen done.");

    await expect(asUser(p.contractorOwner, (tx) => tx`select public.confirm_request_completion(${p.requestId})`)).rejects.toThrow(
      /Request not found/,
    );
    await asUser(p.customer.owner, (tx) => tx`select public.confirm_request_completion(${p.requestId})`);
    expect(await requestRow(p.requestId)).toMatchObject({ status: "completed", confirmed_by: p.customer.owner });
    expect(await kindsFor(p.contractorOwner, `/requests/${p.requestId}`)).toContain("request.completed");

    // The history, in order, for both businesses.
    const history = (userId: string) =>
      asUser(userId, (tx) => tx<{ kind: string; summary: string; detail: string }[]>`
        select kind, summary, detail from public.service_request_events where request_id = ${p.requestId} order by created_at, id
      `);
    const expected = [
      "request.posted",
      "request.awarded",
      "job.scheduled",
      "job.completed",
      "work.reported",
      "work.reopened",
      "work.reported",
      "request.completed",
    ];
    const customerHistory = await history(p.customer.owner);
    expect(customerHistory.map((e) => e.kind)).toEqual(expected);
    expect(customerHistory[1].summary).toBe("Awarded to Harborline Facility Services for $3,200.00");
    expect(customerHistory[5].detail).toBe("The third-floor kitchen was missed.");
    expect((await history(p.contractorOwner)).map((e) => e.kind)).toEqual(expected);
  });

  it("keeps the project's work, history and messages from the losing contractor, workers and strangers", async () => {
    const p = await awardedProject();
    const jobId = await postJob(p.contractorOwner, p.contractorId, { requestId: p.requestId, headcount: 1 });
    await book(p.contractorOwner, p.worker, jobId);
    await asUser(p.customer.owner, (tx) => tx`select public.post_request_message(${p.requestId}, 'Badge pickup is at the front desk.')`);
    const stranger = await createUser("Stranger");

    for (const outsider of [p.rivalOwner, p.worker, stranger]) {
      await expect(asUser(outsider, (tx) => tx`select * from public.request_jobs(${p.requestId})`)).rejects.toThrow(/Request not found/);
      await expect(asUser(outsider, (tx) => tx`select * from public.request_attendance(${p.requestId})`)).rejects.toThrow(/Request not found/);
      await expect(asUser(outsider, (tx) => tx`select * from public.request_thread(${p.requestId})`)).rejects.toThrow(/Request not found/);
      await expect(asUser(outsider, (tx) => tx`select public.post_request_message(${p.requestId}, 'Hello?')`)).rejects.toThrow(
        /Request not found/,
      );
      expect(await asUser(outsider, (tx) => tx`select id from public.service_request_events where request_id = ${p.requestId}`)).toHaveLength(0);
      expect(await asUser(outsider, (tx) => tx`select id from public.request_messages where request_id = ${p.requestId}`)).toHaveLength(0);
    }
    // The worker still sees their own job.
    expect(await asUser(p.worker, (tx) => tx`select id from public.jobs where id = ${jobId}`)).toHaveLength(1);

    // Completion fields and the history are written only by the workflow functions.
    await expect(
      asUser(p.customer.owner, (tx) => tx`update public.service_requests set work_completed_at = now() where id = ${p.requestId}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(p.customer.owner, (tx) => tx`insert into public.service_request_events (request_id, kind, summary) values (${p.requestId}, 'request.posted', 'x')`),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(p.customer.owner, (tx) => tx`select body from public.request_messages`)).rejects.toThrow(/permission denied/);
  });

  it("carries messages between the two businesses with one unread notification each", async () => {
    const p = await awardedProject();
    const post = (userId: string, body: string) => asUser(userId, (tx) => tx`select public.post_request_message(${p.requestId}, ${body})`);
    await post(p.customer.owner, "Can you start Monday?");
    await post(p.customer.owner, "Badge pickup is at the front desk.");
    await post(p.contractorOwner, "Monday works. Crew of three.");
    await post(p.admin, "Staff note: insurance is current.");
    await expect(post(p.contractorOwner, "   ")).rejects.toThrow(/Write a message first/);

    const thread = await asUser(p.contractorOwner, (tx) => tx<{ author_side: string; organization_name: string | null; body: string }[]>`
      select author_side, organization_name, body from public.request_thread(${p.requestId})
    `);
    expect(thread.map((m) => [m.author_side, m.organization_name, m.body])).toEqual([
      ["customer", "Harbor Office Park", "Can you start Monday?"],
      ["customer", "Harbor Office Park", "Badge pickup is at the front desk."],
      ["contractor", "Harborline Facility Services", "Monday works. Crew of three."],
      ["staff", null, "Staff note: insurance is current."],
    ]);
    const unread = (userId: string) =>
      sql<{ body: string }[]>`
        select body from public.notifications where user_id = ${userId} and kind = 'request.message' and read_at is null
      `;
    expect(await unread(p.contractorOwner)).toEqual([{ body: "Staff Member: Staff note: insurance is current." }]);
    expect(await unread(p.customer.owner)).toHaveLength(1);
    // Before the award there is nobody to talk to.
    const fresh = await postRequest(p.customer.owner, p.customer.orgId);
    await expect(asUser(p.customer.owner, (tx) => tx`select public.post_request_message(${fresh}, 'Hi')`)).rejects.toThrow(
      /Request not found/,
    );
  });

  it("stores requirements and freezes them once the request is awarded", async () => {
    const admin = await createAdmin();
    const customer = await approvedCustomer(admin);
    const owner = await createUser("Marcus Bell");
    const contractorId = await createApprovedContractor(owner, admin);
    const requestId = await postRequest(customer.owner, customer.orgId, { requirements: "Crew must pass a building badge check." });
    const edit = () => asUser(customer.owner, (tx) => tx`update public.service_requests set requirements = 'Badge and COI' where id = ${requestId}`);
    expect((await edit()).count).toBe(1);
    const q = await submitQuote(owner, requestId, contractorId);
    await asUser(customer.owner, (tx) => tx`select public.accept_quote(${q})`);
    expect((await edit()).count).toBe(0);
    const [{ requirements }] = await asUser(owner, (tx) => tx`select requirements from public.service_requests where id = ${requestId}`);
    expect(requirements).toBe("Badge and COI");
  });
});
