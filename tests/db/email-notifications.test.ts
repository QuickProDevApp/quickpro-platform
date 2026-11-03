import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Tx } from "@/server/db/rls";
import { deliverPendingEmails, type OutgoingEmail } from "@/server/email/deliver";
import { asUser, createUser, sql } from "./helpers";

// Notification email (D-039): the queue, the person's setting, and the
// mailer role that can do nothing but drain the queue.

afterAll(() => sql.end());

const asMailer = <T>(fn: (tx: Tx) => Promise<T>) =>
  sql.begin(async (tx) => {
    await tx`set local role quickpro_mailer`;
    return fn(tx as unknown as Tx);
  }) as Promise<T>;

const notify = (userId: string, title: string, link = "/app/notifications") =>
  sql`select app.notify(${userId}, 'job.message', ${title}, 'Body text', ${link}, null, null)`;

const status = async (userId: string) =>
  (
    await sql<{ title: string; email_status: string; email_attempts: number; email_error: string | null }[]>`
      select title, email_status, email_attempts, email_error from public.notifications
      where user_id = ${userId} order by created_at, title
    `
  ).map((r) => [r.title, r.email_status, r.email_attempts]);

function fakeTransport(failFor: string[] = []) {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    transport: {
      async send(m: OutgoingEmail) {
        if (failFor.includes(m.to)) throw new Error("550 mailbox unavailable");
        sent.push(m);
      },
    },
  };
}

const deps = (t: ReturnType<typeof fakeTransport>) => ({
  run: asMailer,
  transport: t.transport,
  from: "QuickPro <test@quickpro.example>",
  siteUrl: "https://app.quickpro.example",
});

// Other test files leave notifications behind; start each test with an empty queue.
beforeEach(async () => {
  await sql`update public.notifications set email_status = 'skipped' where email_status in ('pending', 'sending')`;
});

describe("notification emails", () => {
  it("queue every notification and send each one once, to the person's sign-in email", async () => {
    const wendy = await createUser("Wendy Worker");
    await notify(wendy, "You're offered: Lobby floors", "/app/worker/jobs/abc");
    await notify(wendy, "New message: Lobby floors");
    expect(await status(wendy)).toEqual([
      ["You're offered: Lobby floors", "pending", 0],
      ["New message: Lobby floors", "pending", 0],
    ]);

    const t = fakeTransport();
    expect(await deliverPendingEmails(deps(t))).toEqual({ claimed: 2, sent: 2, failed: 0 });
    expect(t.sent.map((m) => m.to)).toEqual([`${wendy}@example.test`, `${wendy}@example.test`]);
    const offer = t.sent.find((m) => m.subject.startsWith("You're offered"))!;
    expect(offer.text).toContain("Hi Wendy,");
    expect(offer.text).toContain("https://app.quickpro.example/app/worker/jobs/abc");
    expect((await status(wendy)).map((r) => r[1])).toEqual(["sent", "sent"]);

    // Nothing is sent twice.
    expect(await deliverPendingEmails(deps(t))).toEqual({ claimed: 0, sent: 0, failed: 0 });
  });

  it("retry failures up to five attempts, skip old backlog and people without an email", async () => {
    const bounce = await createUser("Bea Bounce");
    await notify(bounce, "Will bounce");
    const t = fakeTransport([`${bounce}@example.test`]);
    for (let i = 1; i <= 5; i++) {
      expect(await deliverPendingEmails(deps(t))).toMatchObject({ claimed: 1, failed: 1 });
    }
    const [row] = await sql`select email_status, email_attempts, email_error from public.notifications where user_id = ${bounce}`;
    expect(row).toMatchObject({ email_status: "failed", email_attempts: 5, email_error: "550 mailbox unavailable" });
    expect(await deliverPendingEmails(deps(t))).toMatchObject({ claimed: 0 });

    // A notification from two days ago isn't sent late.
    const late = await createUser("Lou Late");
    await notify(late, "Old news");
    await sql`update public.notifications set created_at = now() - interval '2 days' where user_id = ${late}`;
    const noEmail = await createUser("Nina Noemail");
    await sql`update auth.users set email = null where id = ${noEmail}`;
    await notify(noEmail, "Nowhere to send");
    expect(await deliverPendingEmails(deps(t))).toMatchObject({ claimed: 0 });
    expect(await status(late)).toEqual([["Old news", "skipped", 0]]);
    expect(await status(noEmail)).toEqual([["Nowhere to send", "skipped", 0]]);

    // A send that crashed mid-way is picked up again after ten minutes.
    const crash = await createUser("Cal Crash");
    await notify(crash, "Crashed");
    await asMailer((tx) => tx`select * from app.claim_email_batch(10)`);
    expect(await deliverPendingEmails(deps(t))).toMatchObject({ claimed: 0 });
    await sql`update public.notifications set email_claimed_at = now() - interval '11 minutes' where user_id = ${crash}`;
    expect(await deliverPendingEmails(deps(t))).toMatchObject({ claimed: 1, sent: 1 });
    expect(await status(crash)).toEqual([["Crashed", "sent", 2]]);
  });

  it("follow the person's setting, which only they can change", async () => {
    const wendy = await createUser("Wendy Worker");
    const other = await createUser("Omar Other");
    await notify(wendy, "Before turning off");

    // Turning emails off drops what's waiting and skips new ones.
    await asUser(wendy, (tx) => tx`select public.set_email_notifications(false)`);
    await notify(wendy, "While off");
    expect(await status(wendy)).toEqual([
      ["Before turning off", "skipped", 0],
      ["While off", "skipped", 0],
    ]);
    const [pref] = await asUser(wendy, (tx) => tx`select user_id, email_enabled from public.notification_preferences`);
    expect(pref).toEqual({ user_id: wendy, email_enabled: false });
    // Others can't see or write it.
    expect(await asUser(other, (tx) => tx`select 1 from public.notification_preferences where user_id = ${wendy}`)).toHaveLength(0);
    await expect(
      asUser(other, (tx) => tx`update public.notification_preferences set email_enabled = true where user_id = ${wendy}`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(wendy, (tx) => tx`insert into public.notification_preferences (user_id, email_enabled) values (${wendy}, true)`),
    ).rejects.toThrow(/permission denied/);
    // People can't mark their own notifications as emailed (or not).
    await expect(
      asUser(wendy, (tx) => tx`update public.notifications set email_status = 'pending' where user_id = ${wendy}`),
    ).rejects.toThrow(/permission denied/);

    await asUser(wendy, (tx) => tx`select public.set_email_notifications(true)`);
    await notify(wendy, "Back on");
    const t = fakeTransport();
    expect(await deliverPendingEmails(deps(t))).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(t.sent.map((m) => m.subject)).toEqual(["Back on"]);
    const audit = await sql`
      select action from public.audit_log where entity_type = 'notification_preferences' and entity_id = ${wendy} order by id
    `;
    expect(audit.map((a) => a.action)).toEqual(["notification_preferences.created", "notification_preferences.updated"]);
  });

  it("keep the queue to the mailer role, and the mailer role to the queue", async () => {
    const wendy = await createUser("Wendy Worker");
    await notify(wendy, "Private");
    // Signed-in people and visitors can't claim or finish emails.
    for (const fn of [
      (tx: Tx) => tx`select * from app.claim_email_batch(10)`,
      (tx: Tx) => tx`select app.finish_email(gen_random_uuid(), true, null)`,
    ]) {
      await expect(asUser(wendy, fn)).rejects.toThrow(/permission denied/);
      await expect(
        sql.begin(async (tx) => {
          await tx`set local role anon`;
          return fn(tx as unknown as Tx);
        }),
      ).rejects.toThrow(/permission denied/);
    }
    // The mailer can't read tables directly or use people's functions.
    await expect(asMailer((tx) => tx`select * from public.notifications`)).rejects.toThrow(/permission denied/);
    await expect(asMailer((tx) => tx`select email from auth.users`)).rejects.toThrow(/permission denied/);
    await expect(asMailer((tx) => tx`select public.set_email_notifications(false)`)).rejects.toThrow(/permission denied/);
    // Finishing an email that wasn't claimed changes nothing.
    const [{ id }] = await sql`select id from public.notifications where user_id = ${wendy}`;
    await asMailer((tx) => tx`select app.finish_email(${id}, true, null)`);
    expect(await status(wendy)).toEqual([["Private", "pending", 0]]);
  });
});
