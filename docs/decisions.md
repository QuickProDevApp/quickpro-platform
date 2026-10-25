# Decision log

Each entry: what we decided, why, and what it costs. Newest last. Change a
decision by adding a new entry that supersedes the old one.

## D-001 Start from an empty repository with Next.js + Supabase (2026-10-25)

The repository was empty, so there was no code to preserve. We use Next.js 16
(App Router) with TypeScript, Tailwind CSS v4, and Supabase (Postgres, Auth,
Storage).

- **Why:** one TypeScript codebase for UI and server, Server Components and
  Server Actions keep data access on the server, and Supabase gives managed
  Postgres with row level security, auth with email confirmation and MFA
  options, and private storage, all of which we need on day one.
- **Cost:** coupling to Supabase Auth and Storage. Mitigated by keeping
  business logic in Postgres (portable) and storage behind a small interface.
  Local development needs Docker for `supabase start`.

## D-002 SQL migrations are the source of truth for the schema

Schema, constraints, RLS policies, grants, workflow functions and triggers
live in `supabase/migrations/*.sql`.

- **Why:** RLS policies and grants are the core of our security model and are
  SQL. An ORM schema would have to be duplicated or would not express them.
- **Cost:** row types in TypeScript are written by hand next to the queries.
  Revisit with `supabase gen types` or a typed query layer if drift becomes a
  problem.

## D-003 postgres.js with every query under RLS, not the Supabase data API

Server code connects with `DATABASE_URL` and runs each request inside
`withUser()`, which sets the JWT claims and `set local role authenticated`.

- **Why:** we get real transactions (upload + metadata, multi-row updates),
  plain SQL, and the same RLS enforcement as the Supabase API, without
  exposing a public REST API to browsers.
- **Cost:** the server holds a database credential that could bypass RLS if
  misused; that is why application code only reaches the database through
  `withUser`. Requires the pooler in transaction mode with prepared statements
  off.

## D-004 State changes happen in database functions

Submitting and reviewing organizations, worker profiles and documents are
`SECURITY DEFINER` functions. The API role has no grant on status columns.

- **Why:** the rules (who can submit, what is required, which transitions are
  allowed, notes required to reject) hold no matter which code path calls
  them, and are tested directly.
- **Cost:** some logic lives in PL/pgSQL. The UI mirrors the submission
  checklist for display; the database stays authoritative and its error
  message lists what is missing.

## D-005 Audit log by trigger

Every insert, update and delete on business tables is logged by a generic
trigger in the same transaction, with actor and column diff.

- **Why:** completeness without relying on every developer remembering to log.
- **Cost:** entries describe data changes, not intent ("organization.updated"
  rather than "owner edited phone"). Good enough for operations and disputes;
  add semantic events later where they help.

## D-006 Cache Components off for now

`cacheComponents: false` in `next.config.ts`.

- **Why:** almost every screen is per-user and per-request (dashboards,
  review queues). Cache Components would require Suspense boundaries and
  caching decisions everywhere for little gain at this stage.
- **Cost:** no static shell for authenticated pages. Revisit for public pages
  (contractor profiles, Phase 4) and when navigation speed needs it.

## D-007 Staff access only from the database

`platform_role = 'admin'` cannot be set through the app; `pnpm admin:grant`
needs a direct database connection.

- **Why:** removes a whole class of privilege-escalation bugs.
- **Cost:** granting staff access is an engineering task until a separate,
  audited staff-management flow exists. Finer staff roles are a follow-up.

## D-008 Honest review language

A document reviewed by staff is labeled "Reviewed by QuickPro staff", never
"verified" or "insured". Dashboards show only real counts; features that do
not exist are described as upcoming, not shown as buttons.

- **Why:** product principle and legal exposure. QuickPro has no insurer or
  licensing integration.
- **Cost:** less marketing punch. Revisit if we add a real verification
  provider (for example, a COI tracking service) and can say what it checks.

## D-009 Worker classification is per engagement, not per worker

Worker profiles carry no employment classification. Phase 2 will record, on
each staffing engagement, who engages the worker and on what basis, from a set
of options configured after legal review. QuickPro does not collect or verify
I-9/E-Verify documents; that remains the employer's obligation, and the worker
upload screen tells people not to upload ID or Social Security documents.

- **Why:** the same person may be a W-2 employee of one contractor and work
  through a staffing agency for another; misclassification risk sits with
  whoever engages them, and New York rules need counsel.
- **Cost:** Phase 2 must design the engagement model with legal input before
  shifts go live.

## D-010 Contractor-first, concierge matching

Phase 1 ships onboarding and staff review only; matching is done by QuickPro
staff from the admin dashboard. Customer job requests come in Phase 4.

- **Why:** we cannot assume marketplace liquidity. Contractors already have
  work and a staffing problem; that is where we can deliver value first.
- **Cost:** customers can register but cannot request work yet, and the UI
  says so.

## D-011 Local file storage driver for development

`FILE_STORAGE_DRIVER=local` stores uploads on disk under `.data/uploads` and
is rejected in production.

- **Why:** lets the app and end-to-end tests run against plain Postgres and a
  standalone auth server where Supabase Storage is not available.
- **Cost:** a second code path; it shares the same validation, authorization
  and transaction handling, and only differs in where bytes are written.
