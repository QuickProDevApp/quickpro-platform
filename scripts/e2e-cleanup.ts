/**
 * Removes the accounts and data that end-to-end tests create against a hosted
 * preview. Only accounts on the reserved test domain are touched.
 *
 *   DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm e2e:cleanup
 */
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const TEST_DOMAIN = "@e2e.quickpro.test";

const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!DATABASE_URL || !NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { onnotice: () => {}, prepare: false });
const auth = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  const testUsers = await sql<{ id: string }[]>`
    select id from public.profiles where email like ${"%" + TEST_DOMAIN}
  `;
  const ids = testUsers.map((u) => u.id);
  if (ids.length === 0) {
    console.log("No test accounts found.");
  } else {
    // Organizations the test accounts created take their jobs, members and
    // documents with them (on delete cascade). Staff access goes first so a
    // half-finished cleanup never leaves a test staff account behind.
    await sql.begin(async (tx) => {
      await tx`update public.profiles set platform_role = 'member' where id = any(${ids}::uuid[])`;
      const orgs = await tx`delete from public.organizations where created_by = any(${ids}::uuid[]) returning id`;
      console.log(`Removed ${orgs.length} test organizations and their jobs.`);
    });
    let removed = 0;
    for (const id of ids) {
      const { error } = await auth.auth.admin.deleteUser(id);
      if (error) throw new Error(`Could not delete test account ${id}: ${error.message}`);
      removed++;
    }
    console.log(`Removed ${removed} test accounts.`);
  }
} finally {
  await sql.end();
}
