/**
 * Seeds a labeled demo data set for presentations (D-043): one customer, a
 * general contractor, two competing contractors, a drywall subcontractor,
 * five workers and a staff account, with three projects at different stages
 * of the customer → contractor → worker → payment journey.
 *
 *   DEMO_MODE=on pnpm demo:seed --confirm=<database host>
 *
 * Safety:
 * - Runs only with DEMO_MODE=on, the same switch that shows the "Demo
 *   environment" banner on every page, so demo records are never shown
 *   without that label.
 * - --confirm must name the host in DATABASE_URL, so it can't hit the wrong
 *   database by accident. Never point it at production.
 * - It only adds records. Every account email ends in @demo.quickpro.test
 *   (a reserved domain that receives no mail), and each run uses a new batch
 *   tag, so runs never collide.
 * - Staff approvals and shift clock times are written directly, as a staff
 *   review or the day of the work would leave them. Everything else (posting,
 *   quoting, questions, awarding, offers, subcontracts, checklists, hours,
 *   invoices) goes through the same database functions as the app, as the
 *   person who would do it, under row level security.
 * - Card payments are left for the demo: the invoice is issued and unpaid,
 *   and the contractor has not set up payouts. Both run in Stripe test mode.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres, { type TransactionSql } from "postgres";
import { createLocalStorage } from "../src/server/storage/local-storage";
import { createSupabaseStorage } from "../src/server/storage/supabase-storage";

const need = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (see .env.example).`);
  return value;
};

if (process.env.DEMO_MODE !== "on") {
  console.error("Set DEMO_MODE=on (in .env.local and in the app's environment) before seeding demo data.");
  process.exit(1);
}
const databaseUrl = need("DATABASE_URL");
const host = new URL(databaseUrl.replace(/^postgres(ql)?:/, "http:")).hostname;
const confirm = process.argv.find((a) => a.startsWith("--confirm="))?.slice("--confirm=".length);
if (confirm !== host) {
  console.error(`This adds demo records to the database at ${host}. Re-run with --confirm=${host} if that is a demo or test database.`);
  process.exit(1);
}

const supabaseUrl = need("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");
const auth = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const storage =
  process.env.FILE_STORAGE_DRIVER === "local"
    ? createLocalStorage(process.env.LOCAL_STORAGE_DIR ?? ".data/uploads")
    : createSupabaseStorage(supabaseUrl, serviceKey);
const sql = postgres(databaseUrl, { prepare: false, onnotice: () => {} });

const tag = randomBytes(2).toString("hex");
const password = process.env.DEMO_PASSWORD ?? randomBytes(12).toString("base64url");
if (password.length < 10) throw new Error("DEMO_PASSWORD must be at least 10 characters.");

/** Runs `fn` as a signed-in user, under row level security, like the app does. */
const as = <T,>(userId: string, fn: (tx: TransactionSql) => Promise<T>) =>
  sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;

const accounts: { who: string; email: string }[] = [];

async function person(fullName: string, who: string) {
  const email = `${fullName.toLowerCase().replace(/[^a-z]+/g, ".")}+${tag}@demo.quickpro.test`;
  const { data, error } = await auth.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  accounts.push({ who, email });
  return data.user.id;
}

/** A one-page PDF that says plainly it is a demo record. */
function demoPdf(lines: string[]) {
  const esc = (s: string) => s.replace(/[()\\]/g, "\\$&");
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${740 - i * 24} Td (${esc(l)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

async function approvedContractor(
  ownerId: string,
  name: string,
  services: string[],
  towns: string[],
  profile: { city: string; years: number; crew: number; about: string },
) {
  const [org] = await sql<{ id: string }[]>`
    insert into public.organizations (kind, name, legal_name, description, city, years_in_business, crew_size, phone, email, market_id,
                                      status, created_by, submitted_at, reviewed_at)
    select 'contractor', ${name}, ${name + " (demo record)"}, ${`${profile.about} Example business in QuickPro's demo data.`}, ${profile.city},
           ${profile.years}, ${profile.crew}, '631-555-0100', ${`office+${tag}@demo.quickpro.test`}, m.id,
           'approved', ${ownerId}, now(), now()
    from public.markets m where m.slug = 'suffolk-county-ny'
    returning id
  `;
  await sql`insert into public.organization_members (organization_id, user_id, role) values (${org.id}, ${ownerId}, 'owner')`;
  await sql`insert into public.contractor_services (organization_id, category_id) select ${org.id}, id from public.service_categories where slug in ${sql(services)}`;
  await sql`insert into public.contractor_service_areas (organization_id, service_area_id) select ${org.id}, id from public.service_areas where slug in ${sql(towns)}`;
  // A general liability certificate as staff review leaves it. The file is a
  // demo PDF that says it is not an insurance certificate.
  const docId = randomUUID();
  const bytes = demoPdf([
    "DEMO RECORD - NOT AN INSURANCE CERTIFICATE",
    `${name} is an example business in a QuickPro demo environment.`,
    "No insurance coverage exists or is implied.",
  ]);
  const path = `org/${org.id}/${docId}.pdf`;
  await storage.put(path, bytes, "application/pdf");
  await sql`
    insert into public.qualification_documents
      (id, organization_id, doc_type, title, file_name, mime_type, size_bytes, sha256, storage_path, expires_on, status, uploaded_by, reviewed_at)
    values (${docId}, ${org.id}, 'general_liability_coi', 'General liability certificate (demo)', 'demo-certificate.pdf', 'application/pdf',
            ${bytes.length}, ${createHash("sha256").update(bytes).digest("hex")}, ${path}, current_date + 300, 'approved', ${ownerId}, now())
  `;
  return org.id;
}

async function approvedCustomer(ownerId: string, name: string) {
  const [org] = await sql<{ id: string }[]>`
    insert into public.organizations (kind, name, phone, email, address_line1, city, postal_code, market_id, status, created_by, submitted_at, reviewed_at)
    select 'customer', ${name}, '631-555-0123', ${`facilities+${tag}@demo.quickpro.test`}, '100 Harbor Point Blvd', 'Islip', '11751', m.id,
           'approved', ${ownerId}, now(), now()
    from public.markets m where m.slug = 'suffolk-county-ny'
    returning id
  `;
  await sql`insert into public.organization_members (organization_id, user_id, role) values (${org.id}, ${ownerId}, 'owner')`;
  return org.id;
}

async function approvedWorker(userId: string, headline: string, town: string, skills: string[]) {
  await sql`update public.profiles set phone = '631-555-0142' where id = ${userId}`;
  await sql`
    insert into public.worker_profiles (user_id, headline, home_service_area_id, status, submitted_at, reviewed_at)
    select ${userId}, ${headline}, a.id, 'approved', now(), now() from public.service_areas a where a.slug = ${town}
  `;
  await sql`insert into public.worker_skills (user_id, skill_id) select ${userId}, id from public.skills where slug in ${sql(skills)}`;
  for (const weekday of [1, 2, 3, 4, 5]) {
    await sql`insert into public.worker_availability (user_id, weekday, start_time, end_time) values (${userId}, ${weekday}, '07:00', '16:00')`;
  }
}

async function postRequest(
  ownerId: string,
  customerId: string,
  r: { title: string; description: string; category: string; town: string; startInDays: number; budget: [number, number]; address: string },
) {
  return as(ownerId, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.service_requests
        (organization_id, title, description, category_id, service_area_id, preferred_start, budget_min_cents, budget_max_cents, created_by)
      select ${customerId}, ${r.title}, ${r.description}, c.id, a.id, current_date + ${r.startInDays}::int, ${r.budget[0]}, ${r.budget[1]}, ${ownerId}
      from public.service_categories c, public.service_areas a
      where c.slug = ${r.category} and a.slug = ${r.town}
      returning id
    `;
    await tx`
      insert into public.service_request_sites (request_id, address_line1, city, postal_code, access_notes, contact_name, contact_phone)
      values (${row.id}, ${r.address}, 'Islip', '11751', 'Check in at the security desk in the main lobby.', 'Building security', '631-555-0199')
    `;
    return row.id;
  });
}

async function quote(ownerId: string, requestId: string, orgId: string, cents: number, note: string, startInDays: number, endInDays: number) {
  const [{ id }] = await as(ownerId, (tx) => tx<{ id: string }[]>`
    select public.submit_quote(${requestId}, ${orgId}, ${cents}, ${note}, current_date + ${startInDays}::int, current_date + ${endInDays}::int) as id
  `);
  return id;
}

async function postJob(
  ownerId: string,
  orgId: string,
  requestId: string,
  j: { title: string; description: string; category: string; skills: string[]; inDays: number; hours: number; headcount: number; payCents: number },
) {
  return as(ownerId, async (tx) => {
    const [job] = await tx<{ id: string }[]>`
      insert into public.jobs (organization_id, title, description, category_id, service_area_id, starts_at, ends_at,
                               headcount, pay_rate_cents, engagement_type_id, created_by, service_request_id)
      select ${orgId}, ${j.title}, ${j.description}, c.id, a.id,
             ((current_date + ${j.inDays}::int)::timestamp + time '07:00') at time zone 'America/New_York',
             ((current_date + ${j.inDays}::int)::timestamp + time '07:00' + make_interval(hours => ${j.hours})) at time zone 'America/New_York',
             ${j.headcount}, ${j.payCents}, e.id, ${ownerId}, ${requestId}
      from public.service_categories c, public.service_areas a, public.engagement_types e
      where c.slug = ${j.category} and a.slug = 'islip' and e.slug = 'contractor-employee'
      returning id
    `;
    await tx`
      insert into public.job_sites (job_id, address_line1, city, postal_code, contact_name, contact_phone)
      values (${job.id}, '100 Harbor Point Blvd', 'Islip', '11751', 'Marcus Bell', '631-555-0177')
    `;
    await tx`insert into public.job_skills (job_id, skill_id) select ${job.id}, id from public.skills where slug in ${sql(j.skills)}`;
    return job.id;
  });
}

async function book(ownerId: string, workerId: string, jobId: string, note: string) {
  await as(workerId, (tx) => tx`select public.apply_to_job(${jobId}, ${note})`);
  const [{ id }] = await as(ownerId, (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${workerId}) as id`);
  await as(workerId, (tx) => tx`select public.respond_to_offer(${id}, true)`);
  return id;
}

/**
 * The day of the work: the shift is moved to yesterday (7 AM to 3:30 PM) and
 * the worker's check-in and check-out are recorded, as they would be on site.
 */
async function workedYesterday(jobId: string, assignments: { id: string; inLate: number; outLate: number }[]) {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`
      update public.jobs
         set starts_at = ((current_date - 1)::timestamp + time '07:00') at time zone 'America/New_York',
             ends_at = ((current_date - 1)::timestamp + time '15:30') at time zone 'America/New_York'
       where id = ${jobId}
    `;
    for (const a of assignments) {
      await tx`
        update public.job_assignments x
           set checked_in_at = j.starts_at + make_interval(mins => ${a.inLate}),
               checked_out_at = j.ends_at + make_interval(mins => ${a.outLate})
          from public.jobs j
         where j.id = x.job_id and x.id = ${a.id}
      `;
    }
  });
}

async function approveHours(ownerId: string, assignmentId: string) {
  const [a] = await sql<{ checked_in_at: Date; checked_out_at: Date }[]>`
    select checked_in_at, checked_out_at from public.job_assignments where id = ${assignmentId}
  `;
  await as(ownerId, (tx) => tx`select public.approve_timesheet(${assignmentId}, ${a.checked_in_at}, ${a.checked_out_at}, 30, null)`);
}

// ---------------------------------------------------------------------------

console.log(`Seeding demo batch ${tag} into ${host}…`);

const staff = await person("Quinn Avery", "QuickPro staff");
await sql`update public.profiles set platform_role = 'admin' where id = ${staff}`;

const dana = await person("Dana Whitfield", "Customer: Harbor Point Properties (owner)");
const customer = await approvedCustomer(dana, "Harbor Point Properties");

const marcus = await person("Marcus Bell", "General contractor: Bayview Build Co. (owner)");
const bayview = await approvedContractor(marcus, "Bayview Build Co.", ["general-construction", "carpentry", "painting-drywall"], ["islip", "babylon", "brookhaven"], { city: "Bay Shore", years: 14, crew: 22, about: "General contractor for commercial interiors, tenant fit-outs and building refreshes." });
const priya = await person("Priya Shah", "Contractor: North Shore Interiors (owner)");
const northShore = await approvedContractor(priya, "North Shore Interiors", ["carpentry", "painting-drywall"], ["islip", "huntington"], { city: "Huntington", years: 9, crew: 11, about: "Interior carpentry, millwork and finishes for offices and retail." });
const tom = await person("Tom Reyes", "Contractor: Coastline Contracting (owner)");
const coastline = await approvedContractor(tom, "Coastline Contracting", ["carpentry", "general-construction"], ["islip", "babylon"], { city: "Babylon", years: 6, crew: 8, about: "Framing, demolition and general construction for small commercial jobs." });
const luis = await person("Luis Ortega", "Subcontractor: Ridgeline Drywall & Paint (owner)");
const ridgeline = await approvedContractor(luis, "Ridgeline Drywall & Paint", ["painting-drywall"], ["islip", "brookhaven"], { city: "Patchogue", years: 11, crew: 15, about: "Drywall hanging, taping and finishing, and commercial painting." });

// Each contractor publishes its profile, so the public directory and the
// homepage's search show the demo businesses. The page address gets the batch
// tag only when an earlier batch already took the plain one.
for (const [owner, org, name] of [
  [marcus, bayview, "Bayview Build Co."],
  [priya, northShore, "North Shore Interiors"],
  [tom, coastline, "Coastline Contracting"],
  [luis, ridgeline, "Ridgeline Drywall & Paint"],
] as const) {
  const plain = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const [{ taken }] = await sql<{ taken: boolean }[]>`select exists (select 1 from public.contractor_public_profiles where slug = ${plain}) as taken`;
  await as(owner, (tx) => tx`select public.set_public_profile(${org}, true, ${taken ? `${plain}-${tag}` : plain})`);
}

const ana = await person("Ana Morales", "Worker: finish carpenter");
await approvedWorker(ana, "Finish carpenter, 9 years in commercial interiors", "islip", ["finish-carpentry", "doors-hardware"]);
const devon = await person("Devon Price", "Worker: construction laborer");
await approvedWorker(devon, "Construction laborer, demo and site protection", "babylon", ["general-labor", "selective-demolition", "material-handling"]);
const keisha = await person("Keisha Grant", "Worker: drywall taper");
await approvedWorker(keisha, "Drywall taper and finisher", "islip", ["taping-finishing", "drywall-hanging"]);
const sam = await person("Sam Okafor", "Worker: crew lead");
await approvedWorker(sam, "Crew lead, general construction", "brookhaven", ["general-labor", "crew-lead", "bilingual-english-spanish"]);
const rosa = await person("Rosa Delgado", "Worker: commercial painter");
await approvedWorker(rosa, "Commercial painter, interiors and stairwells", "islip", ["commercial-painting"]);

// 1. Open request: three quotes and questions before the award.
const fitOut = await postRequest(dana, customer, {
  title: "Suite 210 tenant fit-out",
  description:
    "Build out 2,400 sq ft for a new tenant: two offices and a conference room in metal stud, new doors and hardware, " +
    "and trim throughout. Work after 6 PM on weekdays; the floor stays occupied.",
  category: "carpentry",
  town: "islip",
  startInDays: 18,
  budget: [3_800_000, 5_200_000],
  address: "100 Harbor Point Blvd, Suite 210",
});
await as(tom, (tx) => tx`select public.post_quote_message(${fitOut}, ${coastline}, ${"Is the freight elevator available after 6 PM, and can we stage materials in the suite overnight?"})`);
await as(dana, (tx) => tx`select public.post_quote_message(${fitOut}, ${coastline}, ${"Yes to both. Book the freight elevator with security a day ahead."})`);
await quote(marcus, fitOut, bayview, 4_680_000, "Metal stud framing, two offices and a conference room, six new doors with hardware, trim throughout. Evening crew of four.", 18, 46);
await quote(tom, fitOut, coastline, 4_390_000, "Framing, doors and trim as drawn. Owner supplies hardware.", 21, 52);
await quote(priya, fitOut, northShore, 5_120_000, "Turnkey: framing, doors and hardware, trim, plus patch and paint of the corridor.", 18, 40);
await as(priya, (tx) => tx`select public.post_quote_message(${fitOut}, ${northShore}, ${"Our price includes corridor paint. Would you like it split out as a separate line?"})`);

// 2. Project in progress: awarded, subcontracted, crew booked, first shift worked.
const lobby = await postRequest(dana, customer, {
  title: "Lobby refresh, Building A",
  description: "Remove the reception millwork, patch and refinish the walls, new trim and two new doors to the mail room.",
  category: "painting-drywall",
  town: "islip",
  startInDays: 1,
  budget: [1_500_000, 2_200_000],
  address: "100 Harbor Point Blvd",
});
const lobbyQuote = await quote(marcus, lobby, bayview, 1_840_000, "Demo and protection, wall repair and finish, trim and two doors. Drywall finish and paint by our subcontractor.", 1, 21);
await as(dana, (tx) => tx`select public.accept_quote(${lobbyQuote})`);
await as(dana, (tx) => tx`select public.post_request_message(${lobby}, ${"Please keep the north entrance open for tenants each morning until 9."})`);
await as(marcus, (tx) => tx`select public.post_request_message(${lobby}, ${"Understood. We'll stage from the loading dock and keep the north entrance clear."})`);
const [{ id: sub }] = await as(marcus, (tx) => tx<{ id: string }[]>`
  select public.offer_subcontract(${lobby}, ${ridgeline}, ${"Tape, finish and paint the lobby walls after demolition. Level 4 finish on the feature wall."}, ${720_000}) as id
`);
await as(luis, (tx) => tx`select public.respond_to_subcontract(${sub}, true, ${"Crew of two starting Thursday."})`);
// The subcontractor staffs its part: a taper has applied and has an offer to answer.
const tapeJob = await postJob(luis, ridgeline, lobby, {
  title: "Tape and finish lobby walls",
  description: "Tape, mud and sand the patched lobby walls to a level 4 finish, ready for paint.",
  category: "painting-drywall",
  skills: ["taping-finishing"],
  inDays: 5,
  hours: 8,
  headcount: 1,
  payCents: 3600,
});
await as(keisha, (tx) => tx`select public.apply_to_job(${tapeJob}, ${"Level 4 and 5 finishes are most of my work."})`);
await as(luis, (tx) => tx`select public.offer_job(${tapeJob}, ${keisha})`);

const demoJob = await postJob(marcus, bayview, lobby, {
  title: "Lobby demolition and floor protection",
  description: "Remove the reception desk and millwork, protect floors and the elevator lobby, haul debris to the dumpster.",
  category: "general-construction",
  skills: ["general-labor", "selective-demolition"],
  inDays: 2,
  hours: 8,
  headcount: 2,
  payCents: 3200,
});
const devonShift = await book(marcus, devon, demoJob, "I've done selective demo in occupied buildings and have my own PPE.");
const samShift = await book(marcus, sam, demoJob, "Can lead the crew and bring a second dolly.");
const items: string[] = [];
for (const label of ["Protect floors and elevator lobby", "Remove reception desk and millwork", "Haul debris and sweep out"]) {
  const [{ id }] = await as(marcus, (tx) => tx<{ id: string }[]>`select public.add_job_checklist_item(${demoJob}, ${label}) as id`);
  items.push(id);
}
await as(sam, (tx) => tx`select public.post_job_message(${demoJob}, ${"I'll pick up the floor protection on the way in. See everyone at 7."})`);
await workedYesterday(demoJob, [
  { id: devonShift, inLate: 2, outLate: 4 },
  { id: samShift, inLate: -6, outLate: 12 },
]);
await as(marcus, (tx) => tx`select public.set_job_checklist_item_done(${items[0]}, true, null)`);
await as(marcus, (tx) => tx`select public.set_job_checklist_item_done(${items[1]}, true, ${"Desk out in two pieces, base cabinets salvaged for the owner."})`);
await approveHours(marcus, devonShift);

const trimJob = await postJob(marcus, bayview, lobby, {
  title: "Trim and door hardware install",
  description: "Install new base and casing in the lobby and hang two new doors to the mail room with closers and lever sets.",
  category: "carpentry",
  skills: ["finish-carpentry", "doors-hardware"],
  inDays: 4,
  hours: 8,
  headcount: 2,
  payCents: 3800,
});
await book(marcus, ana, trimJob, "I hang commercial doors weekly and have my own trim tools.");
await as(sam, (tx) => tx`select public.apply_to_job(${trimJob}, ${"Can help with doors and carry material."})`);

// 3. Finished project: work confirmed by the customer, invoice issued and unpaid.
const stairs = await postRequest(dana, customer, {
  title: "Stairwell repaint, Building B",
  description: "Patch and repaint both stairwells, rails in safety yellow. Weekend work only.",
  category: "painting-drywall",
  town: "islip",
  startInDays: 1,
  budget: [600_000, 900_000],
  address: "120 Harbor Point Blvd",
});
const stairsQuote = await quote(marcus, stairs, bayview, 780_000, "Patch, prime and two coats in both stairwells; rails in safety yellow.", 1, 6);
await as(dana, (tx) => tx`select public.accept_quote(${stairsQuote})`);
const paintJob = await postJob(marcus, bayview, stairs, {
  title: "Stairwell patch and paint",
  description: "Patch, prime and paint stairwells 1 and 2. Rails in safety yellow.",
  category: "painting-drywall",
  skills: ["commercial-painting"],
  inDays: 3,
  hours: 8,
  headcount: 1,
  payCents: 3400,
});
const rosaShift = await book(marcus, rosa, paintJob, "Stairwells are most of my work. I can bring my own ladders.");
await workedYesterday(paintJob, [{ id: rosaShift, inLate: 0, outLate: 0 }]);
await approveHours(marcus, rosaShift);
await as(marcus, (tx) => tx`select public.complete_job(${paintJob})`);
await as(marcus, (tx) => tx`select public.report_request_work_complete(${stairs}, ${"Both stairwells painted, rails done. Touch-up paint left in the janitor's closet."})`);
await as(dana, (tx) => tx`select public.confirm_request_completion(${stairs})`);
await as(marcus, async (tx) => {
  const [{ id }] = await tx<{ id: string }[]>`select public.create_invoice('project'::public.work_context, ${stairs}) as id`;
  const lines = [
    { description: "Stairwell 1: patch, prime and two coats", quantity: 1, unit_cents: 360_000 },
    { description: "Stairwell 2: patch, prime and two coats", quantity: 1, unit_cents: 360_000 },
    { description: "Handrails, safety yellow", quantity: 2, unit_cents: 30_000 },
  ];
  await tx`
    select public.save_invoice_draft(${id}, current_date + 30, ${"Thank you for the work."}, ${"Pay by card in QuickPro, or by check to Bayview Build Co."}, 0, ${tx.json(lines)})
  `;
  await tx`select public.issue_invoice(${id})`;
});

// 4. Reviews, so profiles show what earlier customers said. Each one goes
// through the review flow: a finished, confirmed project, then both sides
// review. The stairwell project above is one; two smaller past projects
// give the other contractors a record too.
async function pastProject(
  contractorOwner: string,
  contractorOrg: string,
  p: { title: string; description: string; category: string; cents: number; note: string; rating: number; review: string },
  crew: { worker: string; skill: string; inDays: number; jobTitle: string },
) {
  const id = await postRequest(dana, customer, {
    title: p.title,
    description: p.description,
    category: p.category,
    town: "islip",
    startInDays: 1,
    budget: [Math.round(p.cents * 0.8), Math.round(p.cents * 1.2)],
    address: "120 Harbor Point Blvd",
  });
  const q = await quote(contractorOwner, id, contractorOrg, p.cents, p.note, 1, 3);
  await as(dana, (tx) => tx`select public.accept_quote(${q})`);
  // The crew shift that did the work, worked and approved like the stairwell job.
  const job = await postJob(contractorOwner, contractorOrg, id, {
    title: crew.jobTitle,
    description: p.description,
    category: p.category,
    skills: [crew.skill],
    inDays: crew.inDays,
    hours: 8,
    headcount: 1,
    payCents: 3600,
  });
  const shift = await book(contractorOwner, crew.worker, job, "Available that day.");
  await workedYesterday(job, [{ id: shift, inLate: 0, outLate: 0 }]);
  await approveHours(contractorOwner, shift);
  await as(contractorOwner, (tx) => tx`select public.complete_job(${job})`);
  await as(contractorOwner, (tx) => tx`select public.report_request_work_complete(${id}, ${"Work complete. Photos and punch list in the thread."})`);
  await as(dana, (tx) => tx`select public.confirm_request_completion(${id})`);
  await as(dana, (tx) => tx`select public.submit_review('project'::public.work_context, ${id}, ${p.rating}, ${p.review})`);
  await as(contractorOwner, (tx) => tx`select public.submit_review('project'::public.work_context, ${id}, 5, ${"Clear scope, quick answers and paid on time."})`);
}
await as(dana, (tx) => tx`select public.submit_review('project'::public.work_context, ${stairs}, 5, ${"Both stairwells done over one weekend with no disruption to tenants. Clean site every morning and the rails look great."})`);
await as(marcus, (tx) => tx`select public.submit_review('project'::public.work_context, ${stairs}, 5, ${"Clear scope, quick answers and easy weekend access."})`);
await pastProject(priya, northShore, {
  title: "Reception desk and wall paneling, Suite 140",
  description: "Build a reception desk and install oak wall paneling in the Suite 140 lobby.",
  category: "carpentry",
  cents: 1_240_000,
  note: "Shop-built desk, field-installed paneling, two weeks.",
  rating: 5,
  review: "Beautiful millwork, finished two days early, and the punch list was handled the same afternoon.",
}, { worker: ana, skill: "finish-carpentry", inDays: 8, jobTitle: "Reception desk install" });
await pastProject(tom, coastline, {
  title: "Storage room demolition, Building C",
  description: "Remove two storage room partitions and haul debris; protect the corridor floors.",
  category: "general-construction",
  cents: 420_000,
  note: "Two-day demolition with floor protection and haul-away.",
  rating: 4,
  review: "Fast and careful demolition. One extra day for haul-away, but they told us early.",
}, { worker: devon, skill: "selective-demolition", inDays: 9, jobTitle: "Partition demolition" });

await sql.end();

console.log(`\nDemo batch ${tag} is ready. Every account uses the password ${process.env.DEMO_PASSWORD ? "from DEMO_PASSWORD" : password}.\n`);
for (const a of accounts) console.log(`  ${a.who.padEnd(52)} ${a.email}`);
console.log("\nCard payments run in Stripe test mode: set up payouts as Bayview, then pay the stairwell invoice as Harbor Point with 4242 4242 4242 4242.");
