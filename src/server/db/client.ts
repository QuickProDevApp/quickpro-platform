import "server-only";
import postgres, { type Sql } from "postgres";
import { env } from "@/server/env";
import { runAsAnon, runAsMailer, runAsPayments, runAsUser, type Tx } from "./rls";

const globalForDb = globalThis as unknown as { quickproSql?: Sql };

function sql(): Sql {
  if (!globalForDb.quickproSql) {
    const { DATABASE_URL, DATABASE_POOL_MAX } = env();
    globalForDb.quickproSql = postgres(DATABASE_URL, {
      max: DATABASE_POOL_MAX,
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
      onnotice: () => {},
    });
  }
  return globalForDb.quickproSql;
}

/**
 * The only way application code reaches the database. Every query runs as the
 * signed-in user under row level security. Pass the id from `requireUser()`,
 * never a value from the request.
 */
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsUser(sql(), userId, fn);
}

/**
 * For public pages only: runs as the anonymous role, which can read reference
 * data and call the read-only public functions (public contractor profiles)
 * and nothing else. Never use it for anything a signed-in user does.
 */
export function withAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsAnon(sql(), fn);
}

/**
 * For the notification mailer only (src/server/email): runs as a role that
 * can claim queued emails and record whether they were sent, nothing else.
 */
export function withMailer<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsMailer(sql(), fn);
}

/** For the Stripe integration only (src/server/payments): records what Stripe reported. */
export function withPayments<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsPayments(sql(), fn);
}

export type { Tx };
