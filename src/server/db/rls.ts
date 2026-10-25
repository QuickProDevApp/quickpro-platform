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
