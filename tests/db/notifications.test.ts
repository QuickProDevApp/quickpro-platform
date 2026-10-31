import { afterAll, describe, expect, it } from "vitest";
import { addMember, asUser, createApprovedWorker, createUser, marketplace, postJob, sql } from "./helpers";

afterAll(() => sql.end());

type Note = { kind: string; title: string; body: string; link_path: string | null; read_at: Date | null };

const inbox = (userId: string) =>
  asUser(userId, (tx) => tx<Note[]>`select kind, title, body, link_path, read_at from public.notifications order by created_at, id`);

/** Drops the review notifications that setting up the marketplace creates. */
const clear = () => sql`delete from public.notifications`;

const kinds = async (userId: string) => (await inbox(userId)).map((n) => n.kind);

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
const respond = (worker: string, id: string, accept: boolean) =>
  asUser(worker, (tx) => tx`select public.respond_to_offer(${id}, ${accept})`);
const post = (userId: string, jobId: string, body: string) =>
  asUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`select public.post_job_message(${jobId}, ${body}) as id`;
    return id;
  });
const thread = (userId: string, jobId: string) =>
  asUser(userId, (tx) => tx<{ body: string | null; author_name: string; author_side: string; hidden: boolean }[]>`
    select body, author_name, author_side, hidden from public.job_thread(${jobId})
  `);

describe("notifications", () => {
  it("tells each side about applications, offers and bookings, never the person acting", async () => {
    const { owner, orgId, worker } = await marketplace();
    const dispatcher = await createUser("Dot Dispatcher");
    const member = await createUser("Mel Member");
    await addMember(orgId, dispatcher, "dispatcher");
    await addMember(orgId, member, "member");
    const jobId = await postJob(owner, orgId);
    await clear();

    await apply(worker, jobId, "Available all day.");
    const [received] = await inbox(owner);
    expect(received).toMatchObject({
      kind: "application.received",
      title: "Wes Worker applied to Office floor refinish",
      body: "Available all day.",
      link_path: `/app/org/${orgId}/jobs/${jobId}`,
    });
    expect(await kinds(dispatcher)).toEqual(["application.received"]);
    expect(await kinds(member)).toEqual([]);
    expect(await kinds(worker)).toEqual([]);

    const assignmentId = await offer(dispatcher, jobId, worker);
    const [offered] = await inbox(worker);
    expect(offered).toMatchObject({ kind: "offer.received", title: "Bayshore Clean Co offered you Office floor refinish", link_path: `/app/worker/jobs/${jobId}` });
    expect(await kinds(dispatcher)).toEqual(["application.received"]);

    await respond(worker, assignmentId, true);
    expect(await kinds(owner)).toEqual(["application.received", "offer.accepted"]);
    expect(await kinds(dispatcher)).toEqual(["application.received", "offer.accepted"]);

    await asUser(owner, (tx) => tx`select public.cancel_job(${jobId}, 'Client postponed')`);
    const last = (await inbox(worker)).at(-1)!;
    expect(last).toMatchObject({ kind: "booking.cancelled", title: "Booking cancelled: Office floor refinish", body: "Job cancelled: Client postponed" });
    expect(await kinds(owner)).toEqual(["application.received", "offer.accepted"]);
  });

  it("tells the business when a worker cancels, and the worker when they are passed over", async () => {
    const { owner, admin, orgId, worker } = await marketplace();
    const second = await createUser("Sue Second");
    await createApprovedWorker(second, admin);
    const jobId = await postJob(owner, orgId);
    await apply(worker, jobId);
    const appId = await apply(second, jobId);
    const assignmentId = await offer(owner, jobId, worker);
    await respond(worker, assignmentId, true);
    await asUser(worker, (tx) => tx`select public.cancel_assignment(${assignmentId}, 'Car broke down')`);
    expect((await inbox(owner)).at(-1)).toMatchObject({ kind: "booking.worker_cancelled", body: "Car broke down" });

    await asUser(owner, (tx) => tx`select public.decline_application(${appId}, 'We need someone with a scrubber license.')`);
    expect((await inbox(second)).at(-1)).toMatchObject({ kind: "application.declined", body: "We need someone with a scrubber license." });
  });

  it("tells people about staff review decisions", async () => {
    const { owner, admin, worker } = await marketplace();
    expect(await kinds(owner)).toContain("organization.approved");
    expect(await kinds(owner)).toContain("document.approved");
    expect(await kinds(worker)).toContain("worker_profile.approved");
    expect(await kinds(admin)).toEqual([]);
  });

  it("is private and changes only through mark_notifications_read", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await apply(worker, jobId);
    const stranger = await createUser("Stranger");
    expect(await asUser(stranger, (tx) => tx`select id from public.notifications`)).toHaveLength(0);
    await expect(asUser(owner, (tx) => tx`update public.notifications set read_at = now()`)).rejects.toThrow("permission denied");
    await expect(asUser(owner, (tx) => tx`delete from public.notifications`)).rejects.toThrow("permission denied");

    const before = await inbox(owner);
    const unread = before.filter((n) => !n.read_at).length;
    expect(unread).toBeGreaterThan(1);
    const [{ id }] = await asUser(owner, (tx) => tx<{ id: string }[]>`select id from public.notifications where kind = 'application.received'`);
    expect((await asUser(owner, (tx) => tx`select public.mark_notifications_read(${[id]}::uuid[]) as n`))[0].n).toBe(1);
    // Someone else's ids are ignored.
    expect((await asUser(stranger, (tx) => tx`select public.mark_notifications_read(${[id]}::uuid[]) as n`))[0].n).toBe(0);
    expect((await asUser(owner, (tx) => tx`select public.mark_notifications_read(null) as n`))[0].n).toBe(unread - 1);
    expect((await inbox(owner)).every((n) => n.read_at)).toBe(true);
  });
});

describe("job message threads", () => {
  it("is shared by the business, workers on the job and staff, and nobody else", async () => {
    const { owner, admin, orgId, worker } = await marketplace();
    const member = await createUser("Mel Member");
    await addMember(orgId, member, "member");
    const jobId = await postJob(owner, orgId);
    const applicantOnly = await createUser("Ann Applicant");
    await createApprovedWorker(applicantOnly, admin);
    await apply(applicantOnly, jobId);
    await apply(worker, jobId);
    await offer(owner, jobId, worker);

    await post(owner, jobId, "Park in the back lot, please.");
    await post(worker, jobId, "Will do. Should I bring my own pads?");
    await post(member, jobId, "Pads are on site.");

    const seen = await thread(worker, jobId);
    expect(seen.map((m) => [m.author_name, m.author_side, m.body])).toEqual([
      ["Pat Owner", "business", "Park in the back lot, please."],
      ["Wes Worker", "worker", "Will do. Should I bring my own pads?"],
      ["Mel Member", "business", "Pads are on site."],
    ]);
    expect(await thread(admin, jobId)).toHaveLength(3);

    const outsider = await createUser("Outsider");
    await expect(thread(outsider, jobId)).rejects.toThrow("Job not found");
    await expect(thread(applicantOnly, jobId)).rejects.toThrow("Job not found");
    await expect(post(applicantOnly, jobId, "Hello?")).rejects.toThrow("Job not found");
    expect(await asUser(outsider, (tx) => tx`select id from public.job_messages where job_id = ${jobId}`)).toHaveLength(0);
    // The text is read only through job_thread().
    await expect(asUser(owner, (tx) => tx`select body from public.job_messages`)).rejects.toThrow("permission denied");
    await expect(
      asUser(owner, (tx) => tx`insert into public.job_messages (job_id, organization_id, author_id, body) values (${jobId}, ${orgId}, ${owner}, 'x')`),
    ).rejects.toThrow("permission denied");
  });

  it("notifies the others with one unread notification per job", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await apply(worker, jobId);
    await offer(owner, jobId, worker);
    await post(owner, jobId, "First");
    await post(owner, jobId, "Second");
    const messages = (await inbox(worker)).filter((n) => n.kind === "job.message");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ title: "New message on Office floor refinish", body: "Pat Owner: Second", link_path: `/app/worker/jobs/${jobId}` });
    expect((await inbox(owner)).filter((n) => n.kind === "job.message")).toHaveLength(0);

    await asUser(worker, (tx) => tx`select public.mark_notifications_read(null)`);
    await post(owner, jobId, "Third");
    expect((await inbox(worker)).filter((n) => n.kind === "job.message")).toHaveLength(2);

    await post(worker, jobId, "Got it");
    expect((await inbox(owner)).filter((n) => n.kind === "job.message").at(-1)).toMatchObject({
      body: "Wes Worker: Got it",
      link_path: `/app/org/${orgId}/jobs/${jobId}`,
    });
  });

  it("refuses empty, oversized and rapid-fire messages", async () => {
    const { owner, orgId } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await expect(post(owner, jobId, "   ")).rejects.toThrow("Write a message first");
    await expect(post(owner, jobId, "x".repeat(2001))).rejects.toThrow("under 2,000 characters");
    for (let i = 0; i < 10; i++) await post(owner, jobId, `Update ${i}`);
    await expect(post(owner, jobId, "One more")).rejects.toThrow("too quickly");
  });

  it("lets staff hide a message from everyone but staff", async () => {
    const { owner, admin, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await apply(worker, jobId);
    await offer(owner, jobId, worker);
    const id = await post(worker, jobId, "Call me on my personal number instead");
    await expect(asUser(owner, (tx) => tx`select public.hide_job_message(${id}, 'Off-platform')`)).rejects.toThrow("Only QuickPro staff");
    await asUser(admin, (tx) => tx`select public.hide_job_message(${id}, 'Moving the conversation off QuickPro')`);
    expect(await thread(owner, jobId)).toEqual([expect.objectContaining({ body: null, hidden: true })]);
    expect(await thread(admin, jobId)).toEqual([expect.objectContaining({ body: "Call me on my personal number instead", hidden: true })]);
    const [audit] = await sql<{ action: string }[]>`
      select action from public.audit_log where entity_type = 'job_message' and entity_id = ${id} and action = 'job_message.updated'
    `;
    expect(audit).toBeDefined();
  });

  it("drops a worker from the thread when their booking is cancelled", async () => {
    const { owner, orgId, worker } = await marketplace();
    const jobId = await postJob(owner, orgId);
    await apply(worker, jobId);
    const assignmentId = await offer(owner, jobId, worker);
    await post(owner, jobId, "Welcome");
    await asUser(owner, (tx) => tx`select public.cancel_assignment(${assignmentId}, 'Plans changed')`);
    await expect(thread(worker, jobId)).rejects.toThrow("Job not found");
  });
});
