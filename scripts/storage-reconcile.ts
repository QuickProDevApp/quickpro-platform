/**
 * Finds and removes storage objects that have no qualification_documents row
 * (left behind when a cleanup after a failed upload or delete also failed),
 * and reports rows whose file is missing. Run on a schedule in production.
 *
 *   pnpm storage:reconcile            # remove orphans older than 60 minutes
 *   pnpm storage:reconcile --dry-run  # report only
 */
import postgres from "postgres";
import { reconcileStorage } from "../src/server/documents/store";
import { createLocalStorage } from "../src/server/storage/local-storage";
import { createSupabaseStorage } from "../src/server/storage/supabase-storage";

const dryRun = process.argv.includes("--dry-run");
const { DATABASE_URL, FILE_STORAGE_DRIVER = "supabase", LOCAL_STORAGE_DIR = ".data/uploads" } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const storage =
  FILE_STORAGE_DRIVER === "local"
    ? createLocalStorage(LOCAL_STORAGE_DIR)
    : createSupabaseStorage(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const sql = postgres(DATABASE_URL, { prepare: false, onnotice: () => {} });

try {
  const report = await reconcileStorage(sql, storage, { dryRun });
  console.log(JSON.stringify(report, null, 2));
  if (report.failedRemovals.length || report.rowsMissingObjects.length) process.exitCode = 2;
} finally {
  await sql.end();
}
