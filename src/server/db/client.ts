import "server-only";
import postgres, { type Sql } from "postgres";
import { env } from "@/server/env";
import { runAsUser, type Tx } from "./rls";

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

export type { Tx };
