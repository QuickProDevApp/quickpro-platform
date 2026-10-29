/**
 * Recreates the integration-test database on plain PostgreSQL:
 * drops it, creates it, applies the Supabase shim and every migration.
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/quickpro_test pnpm db:test:reset
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL is not set.");
  process.exit(1);
}

const target = new URL(url);
const dbName = target.pathname.replace(/^\//, "");
if (!/^[a-z0-9_]*test[a-z0-9_]*$/.test(dbName)) {
  console.error(`Refusing to reset "${dbName}": the database name must contain "test".`);
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");

async function main() {
  const adminUrl = new URL(url!);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { onnotice: () => {} });
  await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
  await admin.unsafe(`create database "${dbName}"`);
  await admin.end();

  const sql = postgres(url!, { onnotice: () => {} });
  await sql.file(path.join(root, "supabase", "tests", "plain-postgres-bootstrap.sql"));
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await sql.unsafe(readFileSync(path.join(migrationsDir, file), "utf8"));
    console.log(`applied ${file}`);
  }
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
