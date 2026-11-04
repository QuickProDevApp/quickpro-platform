// Drains the notification email queue (D-039). Pure apart from its
// dependencies, so database tests drive it with a fake transport.

import type { Tx } from "@/server/db/rls";
import { renderNotificationEmail, type RenderedEmail } from "./render";

export type OutgoingEmail = RenderedEmail & { to: string; from: string };
export type EmailTransport = { send(email: OutgoingEmail): Promise<void> };

export type DeliverDeps = {
  /** Runs as the quickpro_mailer role. */
  run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  transport: EmailTransport;
  from: string;
  siteUrl: string;
};

type Claimed = {
  notification_id: string;
  to_email: string;
  to_name: string | null;
  kind: string;
  title: string;
  body: string;
  link_path: string | null;
};

/** Sends up to `limit` queued emails. Returns how many were sent and failed. */
export async function deliverPendingEmails(deps: DeliverDeps, limit = 20) {
  const batch = await deps.run((tx) => tx<Claimed[]>`select * from app.claim_email_batch(${limit})`);
  let sent = 0;
  let failed = 0;
  for (const n of batch) {
    const rendered = renderNotificationEmail(
      { toName: n.to_name, kind: n.kind, title: n.title, body: n.body, linkPath: n.link_path },
      deps.siteUrl,
    );
    let error: string | null = null;
    try {
      await deps.transport.send({ ...rendered, to: n.to_email, from: deps.from });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await deps.run((tx) => tx`select app.finish_email(${n.notification_id}, ${error === null}, ${error})`);
    if (error === null) sent++;
    else failed++;
  }
  return { claimed: batch.length, sent, failed };
}
