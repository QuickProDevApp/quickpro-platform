import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import postgres, { type TransactionSql } from "postgres";

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

/** An 8×8 blue PNG, for photo uploads. */
export const samplePhoto = {
  name: "lobby-after.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGOQizqBFTEMLQkAGBlQATpZBa0AAAAASUVORK5CYII=", "base64"),
};

/** A confirmed account created through the auth admin API (for flows that do not test sign-up). */
export async function createConfirmedAccount(name: string, prefix: string) {
  const email = uniqueEmail(prefix);
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  return { id: data.user.id, email };
}

function platformSql() {
  return postgres(required("DATABASE_URL"), { prepare: false, onnotice: () => {} });
}

/**
 * An approved Suffolk contractor with a reviewed, current general liability
 * certificate, set up directly in the database as staff review would leave it.
 */
export async function seedApprovedContractor(ownerId: string, name: string) {
  const sql = platformSql();
  try {
    const [org] = await sql<{ id: string }[]>`
      insert into public.organizations (kind, name, legal_name, phone, email, market_id, status, created_by, submitted_at, reviewed_at)
      select 'contractor', ${name}, ${name + " LLC"}, '631-555-0100', 'ops@e2e.quickpro.test', m.id, 'approved', ${ownerId}, now(), now()
      from public.markets m where m.slug = 'suffolk-county-ny'
      returning id
    `;
    await sql`insert into public.organization_members (organization_id, user_id, role) values (${org.id}, ${ownerId}, 'owner')`;
    const docId = randomUUID();
    await sql`
      insert into public.qualification_documents
        (id, organization_id, doc_type, title, file_name, mime_type, size_bytes, sha256, storage_path, expires_on, status, uploaded_by, reviewed_at)
      values (${docId}, ${org.id}, 'general_liability_coi', 'GL certificate', 'gl.pdf', 'application/pdf', 1024,
              ${"b".repeat(64)}, ${`org/${org.id}/${docId}.pdf`}, current_date + 300, 'approved', ${ownerId}, now())
    `;
    return org.id;
  } finally {
    await sql.end();
  }
}

/** An approved worker living in `homeTown` with the given skill and a phone number. */
export async function seedApprovedWorker(userId: string, homeTown: string, skillSlug: string) {
  const sql = platformSql();
  try {
    await sql`update public.profiles set phone = '631-555-0142' where id = ${userId}`;
    await sql`
      insert into public.worker_profiles (user_id, headline, home_service_area_id, status, submitted_at, reviewed_at)
      select ${userId}, 'Floor care tech', a.id, 'approved', now(), now() from public.service_areas a where a.slug = ${homeTown}
    `;
    await sql`insert into public.worker_skills (user_id, skill_id) select ${userId}, id from public.skills where slug = ${skillSlug}`;
    await sql`insert into public.worker_availability (user_id, weekday, start_time, end_time) values (${userId}, 6, '07:00', '15:00')`;
  } finally {
    await sql.end();
  }
}

/** A calendar date `days` from today in New York, as YYYY-MM-DD. */
export function newYorkDate(days: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + days * 86_400_000));
}

/**
 * The newest link in the local Supabase inbox for `email` whose URL contains
 * `marker`. Supports Mailpit (current CLI) and Inbucket (older CLI).
 */
export async function latestEmailLink(email: string, marker: string): Promise<string> {
  const base = process.env.E2E_MAILBOX_URL ?? "http://127.0.0.1:54324";
  const find = (text: string) =>
    [...text.replaceAll("&amp;", "&").matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]).find((u) => u.includes(marker));
  for (let attempt = 0; attempt < 30; attempt++) {
    const mailpit = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).catch(() => null);
    if (mailpit?.ok) {
      const { messages } = (await mailpit.json()) as { messages: { ID: string }[] };
      if (messages?.length) {
        const message = (await (await fetch(`${base}/api/v1/message/${messages[0].ID}`)).json()) as { Text?: string; HTML?: string };
        const link = find(`${message.Text ?? ""} ${message.HTML ?? ""}`);
        if (link) return link;
      }
    } else {
      const mailbox = email.split("@")[0];
      const inbucket = await fetch(`${base}/api/v1/mailbox/${mailbox}`).catch(() => null);
      if (inbucket?.ok) {
        const list = (await inbucket.json()) as { id: string }[];
        if (list.length) {
          const message = (await (await fetch(`${base}/api/v1/mailbox/${mailbox}/${list.at(-1)!.id}`)).json()) as {
            body: { text?: string; html?: string };
          };
          const link = find(`${message.body.text ?? ""} ${message.body.html ?? ""}`);
          if (link) return link;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No email with a ${marker} link arrived for ${email}`);
}

/** An open job posted by `ownerId`, starting `days` from now at 07:00 New York time, set up directly in the database. */
export async function seedOpenJob(ownerId: string, orgId: string, title: string, days = 3, requestId: string | null = null) {
  const sql = platformSql();
  try {
    return await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: "authenticated" })}, true)`;
      const start = `${newYorkDate(days)} 07:00`;
      const [job] = await tx<{ id: string }[]>`
        insert into public.jobs (organization_id, title, description, category_id, service_area_id, starts_at, ends_at,
                                 headcount, pay_rate_cents, engagement_type_id, created_by, service_request_id)
        select ${orgId}, ${title}, 'Strip and wax the lobby.', c.id, a.id,
               (${start}::timestamp at time zone 'America/New_York'),
               (${start}::timestamp at time zone 'America/New_York') + interval '8 hours',
               1, 2400, e.id, ${ownerId}, ${requestId}
        from public.service_categories c, public.service_areas a, public.engagement_types e
        where c.slug = 'commercial-cleaning' and a.slug = 'islip' and e.slug = 'contractor-employee'
        returning id
      `;
      await tx`
        insert into public.job_sites (job_id, address_line1, city, postal_code, contact_name, contact_phone)
        values (${job.id}, '100 Carleton Ave', 'Central Islip', '11722', 'Sam', '631-555-0177')
      `;
      return job.id;
    });
  } finally {
    await sql.end();
  }
}

/** An approved customer organization with an address in Islip. */
export async function seedApprovedCustomer(ownerId: string, name: string) {
  const sql = platformSql();
  try {
    const [org] = await sql<{ id: string }[]>`
      insert into public.organizations (kind, name, phone, email, address_line1, city, postal_code, market_id, status, created_by, submitted_at, reviewed_at)
      select 'customer', ${name}, '631-555-0123', 'pm@e2e.quickpro.test', '200 Carleton Ave', 'Islip', '11751', m.id, 'approved', ${ownerId}, now(), now()
      from public.markets m where m.slug = 'suffolk-county-ny'
      returning id
    `;
    await sql`insert into public.organization_members (organization_id, user_id, role) values (${org.id}, ${ownerId}, 'owner')`;
    return org.id;
  } finally {
    await sql.end();
  }
}

/** Lists a service category and town for a contractor. */
export async function seedContractorCoverage(orgId: string, categorySlug: string, townSlug: string) {
  const sql = platformSql();
  try {
    await sql`insert into public.contractor_services (organization_id, category_id) select ${orgId}, id from public.service_categories where slug = ${categorySlug}`;
    await sql`insert into public.contractor_service_areas (organization_id, service_area_id) select ${orgId}, id from public.service_areas where slug = ${townSlug}`;
  } finally {
    await sql.end();
  }
}

/**
 * Test-only clock jump: moves a job so it started `minutesAgo` minutes ago,
 * as it would be on the day of the work. Runs with triggers off (like the
 * platform's own maintenance), because the posting rules refuse past start
 * times. Everything after this step goes through the app as usual.
 */
export async function startJobNow(jobId: string, minutesAgo = 10) {
  const sql = platformSql();
  try {
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`
        update public.jobs
           set starts_at = now() - make_interval(mins => ${minutesAgo}),
               ends_at = now() + interval '4 hours'
         where id = ${jobId}
      `;
    });
  } finally {
    await sql.end();
  }
}

/**
 * A customer request awarded to a contractor, made through the real workflow
 * functions as each business's owner (row level security applies): the
 * customer posts it, the contractor quotes, the customer accepts.
 */
export async function seedAwardedProject(o: {
  customerOwnerId: string;
  customerId: string;
  contractorOwnerId: string;
  contractorId: string;
  title: string;
  amountCents?: number;
}) {
  const sql = platformSql();
  const as = <T>(userId: string, fn: (tx: TransactionSql) => Promise<T>) =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      return fn(tx);
    }) as Promise<T>;
  try {
    const requestId = await as(o.customerOwnerId, async (tx) => {
      const [r] = await tx<{ id: string }[]>`
        insert into public.service_requests
          (organization_id, title, description, category_id, service_area_id, preferred_start, budget_min_cents, budget_max_cents, created_by)
        select ${o.customerId}, ${o.title}, 'Nightly cleaning of three floors plus exterior glass on the south face.', c.id, a.id,
               current_date + 7, 200000, 500000, ${o.customerOwnerId}
        from public.service_categories c, public.service_areas a
        where c.slug = 'commercial-cleaning' and a.slug = 'islip'
        returning id
      `;
      await tx`
        insert into public.service_request_sites (request_id, address_line1, city, postal_code, access_notes, contact_name, contact_phone)
        values (${r.id}, '200 Carleton Ave', 'Central Islip', '11722', 'Loading dock on the east side.', 'Sam Security', '631-555-0199')
      `;
      return r.id;
    });
    const quoteId = await as(o.contractorOwnerId, async (tx) => {
      const [q] = await tx<{ id: string }[]>`
        select public.submit_quote(${requestId}, ${o.contractorId}, ${o.amountCents ?? 320000},
          'Nightly cleaning of all three floors, plus the exterior glass.', current_date + 7, current_date + 30) as id
      `;
      return q.id;
    });
    await as(o.customerOwnerId, (tx) => tx`select public.accept_quote(${quoteId})`);
    return requestId;
  } finally {
    await sql.end();
  }
}

/**
 * Finishes an awarded project through the real workflow functions, as each
 * party: the contractor posts a job on it, the worker applies and accepts,
 * the shift runs (after a test-only clock jump), the contractor completes
 * the job and reports the work, and the customer confirms.
 */
export async function seedFinishedProject(o: {
  requestId: string;
  customerOwnerId: string;
  contractorOwnerId: string;
  contractorId: string;
  workerId: string;
  jobTitle: string;
}) {
  const sql = platformSql();
  const as = <T>(userId: string, fn: (tx: TransactionSql) => Promise<T>) =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      return fn(tx);
    }) as Promise<T>;
  try {
    const jobId = await as(o.contractorOwnerId, async (tx) => {
      const [job] = await tx<{ id: string }[]>`
        insert into public.jobs (organization_id, title, description, category_id, service_area_id, starts_at, ends_at,
                                 headcount, pay_rate_cents, engagement_type_id, created_by, service_request_id)
        select ${o.contractorId}, ${o.jobTitle}, 'Strip and wax the lobby.', c.id, a.id,
               now() + interval '2 days', now() + interval '2 days 8 hours',
               1, 2600, e.id, ${o.contractorOwnerId}, ${o.requestId}
        from public.service_categories c, public.service_areas a, public.engagement_types e
        where c.slug = 'commercial-cleaning' and a.slug = 'islip' and e.slug = 'contractor-employee'
        returning id
      `;
      await tx`
        insert into public.job_sites (job_id, address_line1, city, postal_code, contact_name, contact_phone)
        values (${job.id}, '200 Carleton Ave', 'Central Islip', '11722', 'Sam', '631-555-0177')
      `;
      return job.id;
    });
    await as(o.workerId, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
    const [{ id: assignmentId }] = await as(o.contractorOwnerId, (tx) => tx<{ id: string }[]>`
      select public.offer_job(${jobId}, ${o.workerId}) as id
    `);
    await as(o.workerId, (tx) => tx`select public.respond_to_offer(${assignmentId}, true)`);
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.jobs set starts_at = now() - interval '30 minutes', ends_at = now() + interval '3 hours' where id = ${jobId}`;
    });
    await as(o.workerId, (tx) => tx`select public.check_in(${assignmentId})`);
    await as(o.workerId, (tx) => tx`select public.check_out(${assignmentId})`);
    await as(o.contractorOwnerId, (tx) => tx`select public.complete_job(${jobId})`);
    await as(o.contractorOwnerId, (tx) => tx`select public.report_request_work_complete(${o.requestId}, 'All three floors done.')`);
    await as(o.customerOwnerId, (tx) => tx`select public.confirm_request_completion(${o.requestId})`);
    return { jobId, assignmentId };
  } finally {
    await sql.end();
  }
}

/** An accepted subcontract on an awarded project, through the real workflow functions. */
export async function seedSubcontract(o: {
  requestId: string;
  primeOwnerId: string;
  subId: string;
  subOwnerId: string;
  scope: string;
  amountCents: number | null;
}) {
  const sql = platformSql();
  const as = <T>(userId: string, fn: (tx: TransactionSql) => Promise<T>) =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      return fn(tx);
    }) as Promise<T>;
  try {
    const [{ id }] = await as(o.primeOwnerId, (tx) => tx<{ id: string }[]>`
      select public.offer_subcontract(${o.requestId}, ${o.subId}, ${o.scope}, ${o.amountCents}) as id
    `);
    await as(o.subOwnerId, (tx) => tx`select public.respond_to_subcontract(${id}, true, null)`);
    return id;
  } finally {
    await sql.end();
  }
}

/** An open service request posted by a customer's owner, in any category and town. */
export async function seedOpenRequest(o: { customerOwnerId: string; customerId: string; title: string; category: string; town: string }) {
  const sql = platformSql();
  try {
    return await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: o.customerOwnerId, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      const [r] = await tx<{ id: string }[]>`
        insert into public.service_requests
          (organization_id, title, description, category_id, service_area_id, preferred_start, budget_min_cents, budget_max_cents, created_by)
        select ${o.customerId}, ${o.title}, 'Spring cleanup of the grounds, beds and walkways around the building.', c.id, a.id,
               current_date + 10, 150000, 300000, ${o.customerOwnerId}
        from public.service_categories c, public.service_areas a
        where c.slug = ${o.category} and a.slug = ${o.town}
        returning id
      `;
      await tx`
        insert into public.service_request_sites (request_id, address_line1, city, postal_code, access_notes, contact_name, contact_phone)
        values (${r.id}, '15 North Ferry Rd', 'Shelter Island', '11964', 'Park by the side gate.', 'Sam Grounds', '631-555-0188')
      `;
      return r.id as string;
    });
  } finally {
    await sql.end();
  }
}

/** Both sides of a finished project review each other (so the reviews are shared), through submit_review. */
export async function seedProjectReviews(o: {
  requestId: string;
  customerOwnerId: string;
  contractorOwnerId: string;
  customerRating: number;
  customerBody: string;
}) {
  const sql = platformSql();
  const as = (userId: string, fn: (tx: TransactionSql) => Promise<unknown>) =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      return fn(tx);
    });
  try {
    await as(o.customerOwnerId, (tx) => tx`
      select public.submit_review('project'::public.work_context, ${o.requestId}, ${o.customerRating}, ${o.customerBody})
    `);
    await as(o.contractorOwnerId, (tx) => tx`
      select public.submit_review('project'::public.work_context, ${o.requestId}, 5, 'Clear scope and quick answers.')
    `);
  } finally {
    await sql.end();
  }
}

/** The worker applies, the business offers, and the worker accepts, through the workflow functions. Returns the shift id. */
export async function seedBookedShift(ownerId: string, workerId: string, jobId: string) {
  const sql = platformSql();
  const as = <T>(userId: string, fn: (tx: TransactionSql) => Promise<T>) =>
    sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      return fn(tx);
    }) as Promise<T>;
  try {
    await as(workerId, (tx) => tx`select public.apply_to_job(${jobId}, 'Available')`);
    const [{ id }] = await as(ownerId, (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${workerId}) as id`);
    await as(workerId, (tx) => tx`select public.respond_to_offer(${id}, true)`);
    return id;
  } finally {
    await sql.end();
  }
}
