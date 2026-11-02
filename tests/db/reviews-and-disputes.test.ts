import { afterAll, describe, expect, it } from "vitest";
import {
  approvedCustomer,
  asUser,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createUser,
  moveJob,
  postJob,
  postRequest,
  sql,
  submitQuote,
} from "./helpers";

afterAll(() => sql.end());

/** Book a worker on a job, run the shift and complete the job. Returns the assignment id. */
async function runShift(owner: string, worker: string, jobId: string) {
  await asUser(worker, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
  const [{ id }] = await asUser(owner, (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`);
  await asUser(worker, (tx) => tx`select public.respond_to_offer(${id}, true)`);
  await moveJob(jobId, -30, 240);
  await asUser(worker, (tx) => tx`select public.check_in(${id})`);
  await asUser(worker, (tx) => tx`select public.check_out(${id})`);
  await asUser(owner, (tx) => tx`select public.complete_job(${jobId})`);
  return id;
}

/**
 * A customer project done end to end: the prime ran one shift, a
 * subcontractor ran another, the subcontract and project are complete and
 * the customer confirmed.
 */
async function finishedProject() {
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

  const [{ id: subcontractId }] = await asUser(primeOwner, (tx) => tx<{ id: string }[]>`
    select public.offer_subcontract(${requestId}, ${subId}, 'Exterior windows on all three floors.', 85000) as id
  `);
  await asUser(subOwner, (tx) => tx`select public.respond_to_subcontract(${subcontractId}, true, null)`);
  const primeJob = await postJob(primeOwner, primeId, { requestId, headcount: 1 });
  const shiftId = await runShift(primeOwner, worker, primeJob);
  const subJob = await postJob(subOwner, subId, { requestId, headcount: 1 });
  const worker2 = await createUser("Wendy Worker");
  await createApprovedWorker(worker2, admin);
  await runShift(subOwner, worker2, subJob);
  await asUser(subOwner, (tx) => tx`select public.complete_subcontract(${subcontractId}, 'Done')`);
  await asUser(primeOwner, (tx) => tx`select public.report_request_work_complete(${requestId}, 'All done')`);
  await asUser(customer.owner, (tx) => tx`select public.confirm_request_completion(${requestId})`);
  return { admin, customer, primeOwner, primeId, subOwner, subId, worker, requestId, subcontractId, shiftId };
}

type Project = Awaited<ReturnType<typeof finishedProject>>;

const review = (userId: string, context: string, target: string, rating: number, body = "") =>
  asUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      select public.submit_review(${context}::public.work_context, ${target}, ${rating}, ${body}) as id
    `;
    return id;
  });

const seen = (userId: string, context: string, target: string) =>
  asUser(userId, (tx) => tx<{ my_side: string | null; can_review: boolean; review_id: string | null; mine: boolean; rating: number | null; published: boolean }[]>`
    select * from public.work_reviews(${context}::public.work_context, ${target})
  `);

const kinds = async (userId: string) =>
  (await sql<{ kind: string }[]>`select kind from public.notifications where user_id = ${userId} order by created_at, id`).map((n) => n.kind);

describe("reviews", () => {
  it("are double-blind between the customer and the contractor, and feed the directory rating", async () => {
    const p = await finishedProject();

    // Not before the work is finished.
    const other = await postRequest(p.customer.owner, p.customer.orgId);
    const q = await submitQuote(p.primeOwner, other, p.primeId);
    await asUser(p.customer.owner, (tx) => tx`select public.accept_quote(${q})`);
    await expect(review(p.customer.owner, "project", other, 5)).rejects.toThrow(/once the work is finished/);

    // Strangers and the subcontractor aren't parties to the project.
    await expect(review(p.subOwner, "project", p.requestId, 5)).rejects.toThrow(/Not found/);
    await expect(review(p.worker, "project", p.requestId, 5)).rejects.toThrow(/Not found/);
    await expect(review(p.customer.owner, "project", p.requestId, 2, "meh")).rejects.toThrow(/what went wrong/);

    await review(p.customer.owner, "project", p.requestId, 5, "Floors look new. Crew was on time every night.");
    expect(await kinds(p.primeOwner)).toContain("review.received");
    await expect(review(p.customer.owner, "project", p.requestId, 4)).rejects.toThrow(/already reviewed/);

    // The contractor can't see the customer's review yet, and the table hides it too.
    const before = await seen(p.primeOwner, "project", p.requestId);
    expect(before).toEqual([expect.objectContaining({ my_side: "contractor", can_review: true, review_id: null })]);
    expect(await asUser(p.primeOwner, (tx) => tx`select id from public.reviews where target_id = ${p.requestId}`)).toHaveLength(0);
    const unpublished = await asUser(p.primeOwner, (tx) => tx`select * from public.org_rating(${p.primeId})`);
    expect(unpublished[0]).toMatchObject({ rating_count: 0 });

    // Once the contractor reviews back, both are published.
    await review(p.primeOwner, "project", p.requestId, 4, "Clear scope, quick answers.");
    const after = await seen(p.primeOwner, "project", p.requestId);
    expect(after.map((r) => [r.mine, r.rating, r.published])).toEqual([
      [false, 5, true],
      [true, 4, true],
    ]);
    const [rating] = await asUser(p.primeOwner, (tx) => tx`select * from public.org_rating(${p.primeId})`);
    expect(rating).toMatchObject({ rating_count: 1 });
    expect(Number(rating.rating_avg)).toBe(5);
    const directory = await asUser(p.customer.owner, (tx) => tx<{ id: string; rating_avg: string; rating_count: number }[]>`
      select id, rating_avg, rating_count from public.contractor_directory(${p.customer.orgId}, null, null)
    `);
    expect(directory.find((d) => d.id === p.primeId)).toMatchObject({ rating_count: 1 });
    const [customerRating] = await asUser(p.primeOwner, (tx) => tx`select * from public.request_customer_rating(${p.requestId})`);
    expect(customerRating).toMatchObject({ rating_count: 1 });

    // Direct writes are refused.
    await expect(
      asUser(p.primeOwner, (tx) => tx`update public.reviews set rating = 5 where target_id = ${p.requestId}`),
    ).rejects.toThrow(/permission denied/);
  });

  it("publishes a one-sided review when the 14-day window closes, and closes reviewing after it", async () => {
    const p = await finishedProject();
    await review(p.subOwner, "subcontract", p.subcontractId, 3, "Lift access was slow to arrange.");
    expect(await seen(p.primeOwner, "subcontract", p.subcontractId)).toEqual([expect.objectContaining({ review_id: null })]);
    await sql`update public.reviews set window_closes_at = now() - interval '1 minute' where target_id = ${p.subcontractId}`;
    await sql`update public.subcontracts set completed_at = now() - interval '15 days' where id = ${p.subcontractId}`;
    const rows = await seen(p.primeOwner, "subcontract", p.subcontractId);
    expect(rows).toEqual([expect.objectContaining({ mine: false, rating: 3, published: true })]);
    expect(rows[0].can_review).toBe(false);
    await expect(review(p.primeOwner, "subcontract", p.subcontractId, 5)).rejects.toThrow(/14 days/);
  });

  it("lets a business and a worker rate each other for a shift, and shows the worker's rating on applicants", async () => {
    const p = await finishedProject();
    await review(p.worker, "shift", p.shiftId, 5, "Clear instructions and paid break.");
    await review(p.primeOwner, "shift", p.shiftId, 4, "Reliable, careful with the machines.");
    const [mine] = await asUser(p.worker, (tx) => tx`select * from public.my_worker_rating()`);
    expect(mine).toMatchObject({ rating_count: 1 });
    const about = await asUser(p.worker, (tx) => tx<{ author_name: string; rating: number }[]>`select author_name, rating from public.my_worker_reviews()`);
    expect(about).toEqual([{ author_name: "Harborline Facility Services", rating: 4 }]);

    // The customer and the subcontractor have no part in the shift.
    await expect(seen(p.customer.owner, "shift", p.shiftId)).rejects.toThrow(/Not found/);
    await expect(seen(p.subOwner, "shift", p.shiftId)).rejects.toThrow(/Not found/);

    // A new job: the business sees the applicant's rating.
    const next = await postJob(p.primeOwner, p.primeId);
    await asUser(p.worker, (tx) => tx`select public.apply_to_job(${next}, 'Available')`);
    const ratings = await asUser(p.primeOwner, (tx) => tx<{ worker_user_id: string; rating_count: number }[]>`
      select worker_user_id, rating_count from public.job_worker_ratings(${next})
    `);
    expect(ratings).toEqual([expect.objectContaining({ worker_user_id: p.worker, rating_count: 1 })]);
    await expect(asUser(p.subOwner, (tx) => tx`select * from public.job_worker_ratings(${next})`)).rejects.toThrow(/Job not found/);
  });

  it("lets the reviewed party reply once and flag a review, and staff hide it from the rating", async () => {
    const p = await finishedProject();
    const id = await review(p.customer.owner, "project", p.requestId, 1, "Crew left the lobby wet and unsigned.");
    await review(p.primeOwner, "project", p.requestId, 5, "Great customer.");

    const reply = (userId: string, body: string) => asUser(userId, (tx) => tx`select public.reply_to_review(${id}, ${body})`);
    await expect(reply(p.customer.owner, "Hi")).rejects.toThrow(/Review not found/);
    await reply(p.primeOwner, "We put down signs on the second night and re-buffed the lobby.");
    await expect(reply(p.primeOwner, "Again")).rejects.toThrow(/already replied/);

    await expect(asUser(p.customer.owner, (tx) => tx`select public.flag_review(${id}, 'Not mine')`)).rejects.toThrow(/Review not found/);
    await asUser(p.primeOwner, (tx) => tx`select public.flag_review(${id}, 'Names a crew member in full.')`);
    expect(await kinds(p.admin)).toContain("review.flagged");
    const flagged = await asUser(p.admin, (tx) => tx<{ id: string }[]>`select id from public.admin_reviews('flagged')`);
    expect(flagged.map((r) => r.id)).toContain(id);

    await expect(asUser(p.primeOwner, (tx) => tx`select public.moderate_review(${id}, true, 'x')`)).rejects.toThrow(/Review not found/);
    await asUser(p.admin, (tx) => tx`select public.moderate_review(${id}, true, 'Names an individual worker.')`);
    const [rating] = await asUser(p.primeOwner, (tx) => tx`select * from public.org_rating(${p.primeId})`);
    expect(rating).toMatchObject({ rating_count: 0 });
    const [hidden] = await asUser(p.primeOwner, (tx) => tx`select hidden, hidden_reason from public.org_reviews(${p.primeId})`);
    expect(hidden).toEqual({ hidden: true, hidden_reason: "Names an individual worker." });
  });
});

describe("disputes", () => {
  const open = (userId: string, context: string, target: string, reason = "quality", summary = "The lobby was left wet with no signs out.") =>
    asUser(userId, async (tx) => {
      const [{ id }] = await tx<{ id: string }[]>`
        select public.open_dispute(${context}::public.work_context, ${target}, ${reason}::public.dispute_reason, ${summary}, 'A re-buff of the lobby.') as id
      `;
      return id;
    });

  it("runs from opening to a staff resolution, with a thread for the two sides and staff", async () => {
    const p: Project = await finishedProject();
    await expect(open(p.customer.owner, "project", p.requestId, "quality", "Too short")).rejects.toThrow(/at least 20/);
    await expect(open(p.subOwner, "project", p.requestId)).rejects.toThrow(/Not found/);

    const id = await open(p.customer.owner, "project", p.requestId);
    await expect(open(p.customer.owner, "project", p.requestId)).rejects.toThrow(/already have an open dispute/);
    expect(await kinds(p.primeOwner)).toContain("dispute.opened");
    expect(await kinds(p.admin)).toContain("dispute.opened");

    const post = (userId: string, body: string) => asUser(userId, (tx) => tx`select public.post_dispute_message(${id}, ${body})`);
    await post(p.primeOwner, "We re-buffed it on the 12th; photos attached to the job.");
    await post(p.admin, "Thanks both. Customer, does the re-buff fix it?");
    await post(p.customer.owner, "Yes, it looks right now.");
    await expect(post(p.subOwner, "Hello")).rejects.toThrow(/Dispute not found/);

    const thread = await asUser(p.primeOwner, (tx) => tx<{ author_side: string; author_name: string }[]>`
      select author_side, author_name from public.dispute_thread(${id})
    `);
    expect(thread.map((m) => m.author_side)).toEqual(["respondent", "staff", "opener"]);
    expect(thread[1].author_name).toBe("QuickPro staff");

    // Only staff resolve, with an explanation.
    const resolve = (userId: string, text: string) =>
      asUser(userId, (tx) => tx`select public.resolve_dispute(${id}, 'resolved_by_parties', ${text})`);
    await expect(resolve(p.customer.owner, "Resolved, thanks.")).rejects.toThrow(/Dispute not found/);
    await expect(resolve(p.admin, "ok")).rejects.toThrow(/at least 10/);
    await resolve(p.admin, "The contractor re-buffed the lobby and the customer confirmed it's fixed.");
    expect(await kinds(p.customer.owner)).toContain("dispute.resolved");
    await expect(post(p.customer.owner, "One more thing")).rejects.toThrow(/closed/);

    const [mine] = await asUser(p.customer.owner, (tx) => tx`select status, outcome, viewer_side, opener_name, respondent_name from public.get_dispute(${id})`);
    expect(mine).toEqual({
      status: "resolved",
      outcome: "resolved_by_parties",
      viewer_side: "opener",
      opener_name: "Harbor Office Park",
      respondent_name: "Harborline Facility Services",
    });
    // The project history records it for both businesses.
    const events = await asUser(p.primeOwner, (tx) => tx<{ kind: string }[]>`
      select kind from public.service_request_events where request_id = ${p.requestId} and kind like 'dispute.%' order by created_at
    `);
    expect(events.map((e) => e.kind)).toEqual(["dispute.opened", "dispute.resolved"]);
  });

  it("keeps each dispute between its two sides and staff", async () => {
    const p = await finishedProject();
    const shiftDispute = await open(p.worker, "shift", p.shiftId, "hours", "I worked until 11:30 but checked out at 11 by mistake.");
    const subDispute = await open(p.primeOwner, "subcontract", p.subcontractId, "incomplete", "Two vestibule panels on the east side were skipped.");

    const visible = async (userId: string, id: string) =>
      (await asUser(userId, (tx) => tx`select id from public.disputes where id = ${id}`)).length;
    expect(await visible(p.primeOwner, shiftDispute)).toBe(1);
    expect(await visible(p.worker, shiftDispute)).toBe(1);
    expect(await visible(p.customer.owner, shiftDispute)).toBe(0);
    expect(await visible(p.subOwner, shiftDispute)).toBe(0);
    expect(await visible(p.customer.owner, subDispute)).toBe(0);
    expect(await visible(p.subOwner, subDispute)).toBe(1);
    await expect(asUser(p.customer.owner, (tx) => tx`select * from public.get_dispute(${subDispute})`)).rejects.toThrow(/Dispute not found/);

    // Lists: the worker's own, a business's, and all for staff.
    const workerList = await asUser(p.worker, (tx) => tx<{ id: string }[]>`select id from public.list_disputes(null, null)`);
    expect(workerList.map((d) => d.id)).toEqual([shiftDispute]);
    const primeList = await asUser(p.primeOwner, (tx) => tx<{ id: string }[]>`select id from public.list_disputes(${p.primeId}, null)`);
    expect(primeList.map((d) => d.id).sort()).toEqual([shiftDispute, subDispute].sort());
    await expect(asUser(p.subOwner, (tx) => tx`select * from public.list_disputes(${p.primeId}, null)`)).rejects.toThrow(/Organization not found/);
    const all = await asUser(p.admin, (tx) => tx<{ id: string }[]>`select id from public.admin_disputes('open')`);
    expect(all.map((d) => d.id)).toEqual(expect.arrayContaining([shiftDispute, subDispute]));
    await expect(asUser(p.primeOwner, (tx) => tx`select * from public.admin_disputes(null)`)).rejects.toThrow(/Not found/);

    // Only the opener withdraws; writes go through the functions.
    await expect(asUser(p.primeOwner, (tx) => tx`select public.withdraw_dispute(${shiftDispute}, null)`)).rejects.toThrow(/Dispute not found/);
    await asUser(p.worker, (tx) => tx`select public.withdraw_dispute(${shiftDispute}, 'Sorted it out with the dispatcher.')`);
    expect(await kinds(p.primeOwner)).toContain("dispute.withdrawn");
    await expect(
      asUser(p.primeOwner, (tx) => tx`update public.disputes set status = 'resolved' where id = ${subDispute}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(p.primeOwner, (tx) => tx`insert into public.dispute_messages (dispute_id, author_side, body) values (${subDispute}, 'staff', 'fake')`),
    ).rejects.toThrow(/permission denied/);
  });

  it("is only for agreed work, within 90 days", async () => {
    const p = await finishedProject();
    const unawarded = await postRequest(p.customer.owner, p.customer.orgId);
    await expect(open(p.customer.owner, "project", unawarded)).rejects.toThrow(/Not found/);
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.service_requests set completed_at = now() - interval '91 days' where id = ${p.requestId}`;
    });
    await expect(open(p.customer.owner, "project", p.requestId)).rejects.toThrow(/90 days/);
  });
});
