import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set for end-to-end tests (see .env.example).`);
  return value;
}

export const admin = () =>
  createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}@e2e.quickpro.test`;
}

export const PASSWORD = "correct-horse-battery";

/** Signs up through the UI. If email confirmation is on, confirms through the admin API and signs in. */
export async function signUpThroughUi(page: Page, opts: { name: string; email: string; as?: string }) {
  await page.goto(opts.as ? `/sign-up?as=${opts.as}` : "/sign-up");
  await page.getByLabel("Full name").fill(opts.name);
  await page.getByLabel("Work email").fill(opts.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL(/\/(check-email|app)/);
  if (page.url().includes("/check-email")) {
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await confirmEmail(opts.email);
    await signIn(page, opts.email);
  }
}

export async function confirmEmail(email: string) {
  const client = admin();
  const { data, error } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`No auth user for ${email}`);
  const result = await client.auth.admin.updateUserById(user.id, { email_confirm: true });
  if (result.error) throw result.error;
}

export async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app/);
}

/** Creates a confirmed account and makes it QuickPro staff directly in the database. */
export async function createStaffAccount() {
  const email = uniqueEmail("staff");
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "E2E Staff" },
  });
  if (error) throw error;
  const sql = postgres(required("DATABASE_URL"), { prepare: false, onnotice: () => {} });
  await sql`update public.profiles set platform_role = 'admin' where id = ${data.user.id}`;
  await sql.end();
  return email;
}

/** A minimal valid PDF. */
export const samplePdf = {
  name: "gl-certificate.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  ),
};
