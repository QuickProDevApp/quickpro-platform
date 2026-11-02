import { afterAll, describe, expect, it } from "vitest";
import {
  approvedCustomer,
  asUser,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createSubmittableContractor,
  createUser,
  moveJob,
  nassauId,
  postJob,
  postRequest,
  sql,
  submitQuote,
} from "./helpers";

afterAll(() => sql.end());

/** A project awarded to a prime contractor, a second approved contractor to subcontract to, and a worker. */
async function project() {
  const admin = await createAdmin();
  const customer = await approvedCustomer(admin);
  const primeOwner = await createUser("Marcus Bell");
  const primeId = await createApprovedContractor(primeOwner, admin, "Harborline Facility Services");
  const subOwner = await createUser("Sofia Reyes");
  const subId = await createApprovedContractor(subOwner, admin, "Reyes Window Works");
  const worker = await createUser("Wes Worker");
  await createApprovedWorker(worker, admin);
  const requestId = await postRequest(customer.owner, customer.orgId);
  const quote = await submitQuote(primeOwner, requestId, primeId, 320000);
  await asUser(customer.owner, (tx) => tx`select public.accept_quote(${quote})`);
  return { admin, customer, primeOwner, primeId, subOwner, subId, worker, requestId };
}

type Project = Awaited<ReturnType<typeof project>>;

const offer = (p: Project, userId = p.primeOwner, subId = p.subId, scope = "Exterior windows on all three floors.", amount: number | null = 85000) =>
  asUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select public.offer_subcontract(${p.requestId}, ${subId}, ${scope}, ${amount}) as id`;
    return id;
  });

const respond = (userId: string, id: string, accept: boolean, note: string | null = null) =>
  asUser(userId, (tx) => tx`select public.respond_to_subcontract(${id}, ${accept}, ${note})`);

const kinds = async (userId: string) =>
  (await sql<{ kind: string }[]>`select kind from public.notifications where user_id = ${userId} order by created_at, id`).map((n) => n.kind);

/** The worker applies, is offered and accepts; then the shift happens and the business completes the job. */
async function runJob(owner: string, worker: string, jobId: string) {
  await asUser(worker, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
  const [{ id }] = await asUser(owner, (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`);
  await asUser(worker, (tx) => tx`select public.respond_to_offer(${id}, true)`);
  await moveJob(jobId, -30, 240);
  await asUser(worker, (tx) => tx`select public.check_in(${id})`);
  await asUser(worker, (tx) => tx`select public.check_out(${id})`);
  await asUser(owner, (tx) => tx`select public.complete_job(${jobId})`);
}

describe("subcontracts", () => {
  it("lets only the prime offer part of an in-progress project to another approved, insured contractor", async () => {
    const p = await project();

    // The customer, the subcontractor itself and strangers can't offer.
    for (const someone of [p.customer.owner, p.subOwner, await createUser("Stranger")]) {
      await expect(offer(p, someone)).rejects.toThrow(/Request not found/);
    }
    await expect(offer(p, p.primeOwner, p.primeId)).rejects.toThrow(/another approved contractor/);
    await expect(offer(p, p.primeOwner, p.customer.orgId)).rejects.toThrow(/another approved contractor/);
    await expect(offer(p, p.primeOwner, p.subId, "Windows")).rejects.toThrow(/sentence or two/);

    // Not approved yet, or outside the market.
    const pendingOwner = await createUser("Pending Owner");
    const pendingId = await createSubmittableContractor(pendingOwner, "Not Yet Approved");
    await expect(offer(p, p.primeOwner, pendingId)).rejects.toThrow(/another approved contractor/);
    const farOwner = await createUser("Far Owner");
    const farId = await createApprovedContractor(farOwner, p.admin, "Nassau Glass");
    const nassau = await nassauId();
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.organizations set market_id = ${nassau} where id = ${farId}`;
    });
    await expect(offer(p, p.primeOwner, farId)).rejects.toThrow(/work in your market/);

    // The directory lists approved, insured contractors in the market, never the prime.
    const directory = await asUser(p.primeOwner, (tx) => tx<{ id: string }[]>`select id from public.subcontractor_directory(${p.primeId}, null)`);
    expect(directory.map((d) => d.id)).toContain(p.subId);
    expect(directory.map((d) => d.id)).not.toContain(p.primeId);
    expect(directory.map((d) => d.id)).not.toContain(pendingId);
    expect(directory.map((d) => d.id)).not.toContain(farId);
    await expect(asUser(p.subOwner, (tx) => tx`select * from public.subcontractor_directory(${p.primeId}, null)`)).rejects.toThrow(
      /Organization not found/,
    );

    const id = await offer(p);
    expect(await kinds(p.subOwner)).toContain("subcontract.offered");
    await expect(offer(p)).rejects.toThrow(/already has a subcontract/);

    // Offered: the subcontractor sees the request, not the site, and can't schedule yet.
    expect(await asUser(p.subOwner, (tx) => tx`select id from public.service_requests where id = ${p.requestId}`)).toHaveLength(1);
    expect(await asUser(p.subOwner, (tx) => tx`select request_id from public.service_request_sites where request_id = ${p.requestId}`)).toHaveLength(0);
    await expect(postJob(p.subOwner, p.subId, { requestId: p.requestId })).rejects.toThrow(/subcontracted to it/);

    // Only the subcontractor answers, once.
    await expect(respond(p.primeOwner, id, true)).rejects.toThrow(/Subcontract not found/);
    await respond(p.subOwner, id, true, "We can start Tuesday.");
    await expect(respond(p.subOwner, id, false)).rejects.toThrow(/already accepted/);
    expect(await kinds(p.primeOwner)).toContain("subcontract.accepted");
    expect(await asUser(p.subOwner, (tx) => tx`select request_id from public.service_request_sites where request_id = ${p.requestId}`)).toHaveLength(1);

    // Nothing is offered on a project that isn't in progress.
    const unawarded = await postRequest(p.customer.owner, p.customer.orgId);
    await expect(
      asUser(p.primeOwner, (tx) => tx`select public.offer_subcontract(${unawarded}, ${p.subId}, 'Exterior windows on all floors.', null)`),
    ).rejects.toThrow(/Request not found/);
  });

  it("runs a subcontracted part from offer to the customer's confirmation", async () => {
    const p = await project();
    const subcontractId = await offer(p);
    await respond(p.subOwner, subcontractId, true);

    const primeJob = await postJob(p.primeOwner, p.primeId, { requestId: p.requestId, headcount: 1 });
    const subJob = await postJob(p.subOwner, p.subId, { requestId: p.requestId, headcount: 1 });

    // The customer sees both businesses' jobs, and who the subcontractor is, without the price.
    const customerJobs = await asUser(p.customer.owner, (tx) => tx<{ id: string; organization_name: string }[]>`
      select id, organization_name from public.request_jobs(${p.requestId})
    `);
    expect(customerJobs.map((j) => [j.id, j.organization_name]).sort()).toEqual(
      [
        [primeJob, "Harborline Facility Services"],
        [subJob, "Reyes Window Works"],
      ].sort(),
    );
    const [seenByCustomer] = await asUser(p.customer.owner, (tx) => tx`select * from public.project_subcontracts(${p.requestId})`);
    expect(seenByCustomer).toMatchObject({ sub_name: "Reyes Window Works", status: "accepted", amount_cents: null });
    const [seenByPrime] = await asUser(p.primeOwner, (tx) => tx`select * from public.project_subcontracts(${p.requestId})`);
    expect(seenByPrime).toMatchObject({ amount_cents: 85000 });

    // The subcontractor sees only its own jobs.
    const subJobs = await asUser(p.subOwner, (tx) => tx<{ id: string }[]>`select id from public.request_jobs(${p.requestId})`);
    expect(subJobs.map((j) => j.id)).toEqual([subJob]);

    await runJob(p.primeOwner, p.worker, primeJob);
    const report = () => asUser(p.primeOwner, (tx) => tx`select public.report_request_work_complete(${p.requestId}, 'All done.')`);
    // The subcontractor's part is still open.
    await expect(report()).rejects.toThrow(/Complete or cancel the 1 job/);

    const worker2 = await createUser("Wendy Worker");
    await createApprovedWorker(worker2, p.admin);
    const completePart = () => asUser(p.subOwner, (tx) => tx`select public.complete_subcontract(${subcontractId}, 'Windows washed.')`);
    await expect(completePart()).rejects.toThrow(/Complete or cancel your 1 open job/);
    await runJob(p.subOwner, worker2, subJob);

    // A live subcontract holds up the prime's report until it is finished.
    await expect(report()).rejects.toThrow(/Wait for 1 subcontract/);
    await expect(asUser(p.primeOwner, (tx) => tx`select public.complete_subcontract(${subcontractId}, '')`)).rejects.toThrow(
      /Subcontract not found/,
    );
    await completePart();
    expect(await kinds(p.primeOwner)).toContain("subcontract.completed");
    await report();
    await asUser(p.customer.owner, (tx) => tx`select public.confirm_request_completion(${p.requestId})`);
    const [{ status }] = await sql`select status from public.service_requests where id = ${p.requestId}`;
    expect(status).toBe("completed");

    // The customer's history names the subcontractor; the subcontractor's history is its part, without the award price.
    const history = (userId: string) =>
      asUser(userId, (tx) => tx<{ kind: string; summary: string }[]>`
        select kind, summary from public.service_request_events where request_id = ${p.requestId} order by created_at, id
      `);
    const customerHistory = await history(p.customer.owner);
    expect(customerHistory.map((e) => e.summary)).toEqual(
      expect.arrayContaining([
        "Reyes Window Works joined as a subcontractor",
        "Job scheduled: Office floor refinish (Reyes Window Works)",
        "Reyes Window Works finished its part",
      ]),
    );
    const subHistory = await history(p.subOwner);
    expect(subHistory.map((e) => e.kind)).toEqual(["subcontract.accepted", "job.scheduled", "job.completed", "subcontract.completed"]);
    expect(JSON.stringify(subHistory)).not.toMatch(/\$3,200/);
  });

  it("keeps the customer's thread, other crews and the price from the subcontractor", async () => {
    const p = await project();
    const subcontractId = await offer(p);
    await respond(p.subOwner, subcontractId, true);
    const primeJob = await postJob(p.primeOwner, p.primeId, { requestId: p.requestId, headcount: 1 });
    await asUser(p.customer.owner, (tx) => tx`select public.post_request_message(${p.requestId}, 'Gate code is 4412.')`);

    await expect(asUser(p.subOwner, (tx) => tx`select * from public.request_thread(${p.requestId})`)).rejects.toThrow(/Request not found/);
    await expect(asUser(p.subOwner, (tx) => tx`select public.post_request_message(${p.requestId}, 'Hi')`)).rejects.toThrow(/Request not found/);
    expect(await asUser(p.subOwner, (tx) => tx`select id from public.request_messages where request_id = ${p.requestId}`)).toHaveLength(0);
    expect(await asUser(p.subOwner, (tx) => tx`select id from public.jobs where id = ${primeJob}`)).toHaveLength(0);
    expect(await asUser(p.subOwner, (tx) => tx`select id from public.quotes where request_id = ${p.requestId}`)).toHaveLength(0);
    expect(await asUser(p.subOwner, (tx) => tx`select job_id from public.request_attendance(${p.requestId})`)).toHaveLength(0);

    // The prime and the subcontractor have their own thread, which the customer doesn't see.
    const post = (userId: string, body: string) => asUser(userId, (tx) => tx`select public.post_subcontract_message(${subcontractId}, ${body})`);
    await post(p.primeOwner, "Ladders are in the east lot.");
    await post(p.subOwner, "Thanks, see you at 7.");
    const thread = await asUser(p.subOwner, (tx) => tx<{ author_side: string; body: string }[]>`
      select author_side, body from public.subcontract_thread(${subcontractId})
    `);
    expect(thread.map((m) => [m.author_side, m.body])).toEqual([
      ["contractor", "Ladders are in the east lot."],
      ["subcontractor", "Thanks, see you at 7."],
    ]);
    await expect(asUser(p.customer.owner, (tx) => tx`select * from public.subcontract_thread(${subcontractId})`)).rejects.toThrow(
      /Subcontract not found/,
    );
    await expect(post(p.customer.owner, "Hello")).rejects.toThrow(/Subcontract not found/);
    const customerThread = await asUser(p.customer.owner, (tx) => tx<{ body: string }[]>`select body from public.request_thread(${p.requestId})`);
    expect(customerThread.map((m) => m.body)).toEqual(["Gate code is 4412."]);
    expect(await kinds(p.subOwner)).toContain("subcontract.message");

    // Staff see everything.
    expect(await asUser(p.admin, (tx) => tx`select * from public.subcontract_thread(${subcontractId})`)).toHaveLength(2);
  });

  it("ends subcontracts only with a reason and once the subcontractor's jobs are closed", async () => {
    const p = await project();
    const subcontractId = await offer(p);
    await respond(p.subOwner, subcontractId, true);
    const subJob = await postJob(p.subOwner, p.subId, { requestId: p.requestId });
    const cancel = (userId: string, reason: string) => asUser(userId, (tx) => tx`select public.cancel_subcontract(${subcontractId}, ${reason})`);

    await expect(cancel(p.primeOwner, " ")).rejects.toThrow(/short reason/);
    await expect(cancel(p.primeOwner, "Customer cut the scope.")).rejects.toThrow(/still has 1 open job/);
    await expect(cancel(p.customer.owner, "No")).rejects.toThrow(/Subcontract not found/);
    await asUser(p.subOwner, (tx) => tx`select public.cancel_job(${subJob}, 'Scope cut')`);
    await cancel(p.primeOwner, "Customer cut the scope.");
    expect(await kinds(p.subOwner)).toContain("subcontract.cancelled");
    await expect(postJob(p.subOwner, p.subId, { requestId: p.requestId })).rejects.toThrow(/subcontracted to it/);
    await expect(asUser(p.subOwner, (tx) => tx`select public.post_subcontract_message(${subcontractId}, 'ok')`)).rejects.toThrow(/has ended/);

    // A declined offer can be followed by a new one.
    const again = await offer(p, p.primeOwner, p.subId, "Just the lobby glass, please.", null);
    await respond(p.subOwner, again, false, "Booked that week.");
    expect(await kinds(p.primeOwner)).toContain("subcontract.declined");
    // The customer sees neither the ended nor the declined subcontract.
    expect(await asUser(p.customer.owner, (tx) => tx`select id from public.project_subcontracts(${p.requestId})`)).toHaveLength(0);
    // Writes go only through the functions.
    await expect(
      asUser(p.primeOwner, (tx) => tx`update public.subcontracts set status = 'completed' where id = ${again}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(p.primeOwner, (tx) => tx`insert into public.subcontracts (request_id, prime_id, sub_id, scope) values (${p.requestId}, ${p.primeId}, ${p.subId}, 'Sneaky direct insert')`),
    ).rejects.toThrow(/permission denied/);
  });
});
