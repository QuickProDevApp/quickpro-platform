import type { Sql, TransactionSql } from "postgres";

export type Tx = TransactionSql<Record<string, unknown>>;

/**
 * Runs `fn` in a transaction as the Postgres `authenticated` role with the
 * given user's id in `request.jwt.claims`, the same way Supabase's API does.
 * Row level security and column grants therefore apply to every query in
 * `fn`, in addition to the checks in the calling server code.
 *
 * Kept free of Next.js imports so integration tests can use it directly.
 */
export async function runAsUser<T>(sql: Sql, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

/**
 * Runs `fn` as the Postgres `anon` role, as a signed-out visitor would through
 * Supabase's API. Used only for public pages; `anon` can read reference data
 * and call the few read-only public functions granted to it, nothing else.
 */
export async function runAsAnon<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true)`;
    await tx`set local role anon`;
    return fn(tx);
  }) as Promise<T>;
}

/**
 * Runs `fn` as the `quickpro_mailer` role, which can only call the two
 * email queue functions (claim a batch, record a result). Used only by the
 * notification mailer (D-039).
 */
export async function runAsMailer<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', '{}', true)`;
    await tx`set local role quickpro_mailer`;
    return fn(tx);
  }) as Promise<T>;
}

/**
 * Runs `fn` as the `quickpro_payments` role, which can only call the
 * functions that record what Stripe reported (D-040).
 */
export async function runAsPayments<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', '{}', true)`;
    await tx`set local role quickpro_payments`;
    return fn(tx);
  }) as Promise<T>;
}
