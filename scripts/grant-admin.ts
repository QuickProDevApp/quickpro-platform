/**
 * Grants or revokes QuickPro staff access. Staff access can never be granted
 * from inside the app; this needs a direct database connection.
 *
 *   pnpm admin:grant someone@example.com
 *   pnpm admin:grant someone@example.com --revoke
 */
import postgres from "postgres";

const [email, flag] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!email || !url) {
  console.error("Usage: DATABASE_URL=... pnpm admin:grant <email> [--revoke]");
  process.exit(1);
}

const role = flag === "--revoke" ? "member" : "admin";
const sql = postgres(url, { onnotice: () => {}, prepare: false });

try {
  const rows = await sql`
    update public.profiles set platform_role = ${role}
    where lower(email) = lower(${email})
    returning id
  `;
  if (rows.length === 0) {
    console.error(`No account with email ${email}. Sign up first.`);
    process.exitCode = 1;
  } else {
    console.log(`${email} is now ${role === "admin" ? "QuickPro staff" : "a regular member"}.`);
  }
} finally {
  await sql.end();
}
