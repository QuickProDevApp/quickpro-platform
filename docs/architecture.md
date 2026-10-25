# QuickPro architecture

Status: Phase 1 (foundation). Decisions and their tradeoffs are recorded in
[decisions.md](decisions.md).

## Stack

| Layer | Choice |
| --- | --- |
| Web app | Next.js 16 (App Router, React 19, Server Components, Server Actions), TypeScript strict |
| Styling | Tailwind CSS v4, a small in-repo component set (`src/components/ui`), Geist font bundled locally |
| Database | PostgreSQL (Supabase), schema and policies in SQL migrations under `supabase/migrations` |
| Data access | `postgres` (postgres.js) with tagged-template SQL, every query run as the signed-in user under row level security |
| Auth | Supabase Auth (email + password, email confirmation, PKCE), sessions in cookies set and refreshed server-side via `@supabase/ssr` |
| Files | Supabase Storage private bucket, server-side only; local-disk driver for development |
| Validation | Zod on every server action; constraints and workflow functions in the database |
| Tests | Vitest (unit + database integration on real Postgres), Playwright (end to end, mobile and desktop) |
| Payments | Stripe, Phase 5, test mode first. Not present in Phase 1. |

## Shape of the app

```
src/
  app/
    page.tsx                  public landing page
    (auth)/                   sign-in, sign-up, check-email (+ server actions)
    auth/confirm, auth/sign-out   email link landing (PKCE code or token_hash), POST sign-out
    app/                      everything behind sign-in
      page.tsx                role hub: routes to the user's only role or lists them
      onboarding/             choose contractor / worker / customer
      account/                name and phone
      org/[orgId]/            contractor or customer organization: overview, profile, services, documents
      worker/                 worker profile: overview, profile & skills, availability, certifications
      admin/                  staff: overview, organizations, workers, documents, audit log
    api/documents/[id]        authorized document download
  proxy.ts                    refreshes the auth cookie; redirects signed-out visitors away from /app
  server/                     server-only code (imports "server-only")
    env.ts                    validated environment
    db/                       connection and runAsUser (RLS wrapper)
    auth/                     Supabase client, getCurrentUser / requireUser / requireAdmin
    data/                     data access functions, one module per area
    actions/guards.ts         membership and manager checks for org pages and actions
    files/validate.ts         size and file-signature checks
    storage/                  FileStorage interface: Supabase or local disk
    errors.ts                 maps database errors to user-facing messages
  lib/                        shared, client-safe: zod schemas, labels, formatting
  components/                 ui/ primitives and app/ composites
supabase/
  migrations/                 the schema, row level security, workflow functions, audit triggers
  tests/                      plain-Postgres shim used by integration tests and CI
tests/db/                     database integration tests
e2e/                          Playwright tests
```

Routes are server-rendered per request. Server Components read data;
mutations are Server Actions that return a `FormState` for `useActionState`.
There is no client-side Supabase client and no public data API: the browser
only talks to Next.js.

## Domain model (Phase 1)

```
auth.users ──1:1── profiles (platform_role: member | admin)
                      │
     ┌────────────────┼──────────────────────────┐
     │                │                          │
organization_members  worker_profiles ── worker_skills, worker_service_areas, worker_availability
     │ (owner/admin/dispatcher/member)    │
organizations (kind: contractor|customer, status, market)
     │                                    │
     ├── contractor_services ── service_categories
     ├── contractor_service_areas ── service_areas ── markets
     └── qualification_documents (org XOR worker) ─────┘

audit_log (append-only, written by triggers)
```

- **Markets and service areas** are data. Suffolk County (10 towns) is active;
  Nassau County (3 towns, 2 cities) is defined and inactive. Opening a market
  is a data change.
- **Organizations** cover both contractors and customers, with members and
  roles, so a business can add dispatchers later without schema changes.
- **Review status** (`draft → pending_review → approved | rejected`,
  `approved ↔ suspended`) is shared by organizations and worker profiles.
- **Worker profiles** describe skills and availability only. The legal basis
  of any engagement (employee of the contractor, subcontractor, staffing
  agency) is not stored on the worker. It belongs to each future engagement,
  configured after legal review (see decisions.md, D-009).

## Authorization

Three layers, each sufficient to stop the common mistakes of the others:

1. **Route and action checks.** `requireUser`, `requireAdmin`,
   `requireMembership` and `requireOrgManager` run in every page, layout,
   action and route handler. Pages a user may not see return 404 (they do not
   confirm the resource exists). `proxy.ts` redirects signed-out visitors but
   is not relied on.
2. **Row level security.** `withUser(userId, fn)` opens a transaction, sets
   `request.jwt.claims` to the user's id and switches to the `authenticated`
   role, exactly as Supabase's API does. Every table has RLS enabled with
   policies built on `auth.uid()`, `app.is_admin()`, `app.is_org_member()` and
   `app.can_manage_org()`. A query that forgets a `where` clause still returns
   only rows the user may see.
3. **Column grants and workflow functions.** The API roles get explicit,
   column-level `insert`/`update` grants. Review fields (`status`,
   `reviewed_by`, `review_notes`, ...) are never granted, so they change only
   through `SECURITY DEFINER` functions that enforce the state machine:
   `create_organization`, `submit_organization_for_review`,
   `review_organization`, `submit_worker_profile_for_review`,
   `review_worker_profile`, `review_document`. Supabase's default "grant
   everything to anon/authenticated" privileges are revoked for new objects.

Staff access (`platform_role = 'admin'`) can only be granted with a direct
database connection (`pnpm admin:grant`), never from the app.

## Audit log

`public.audit_log` is append-only: the API roles can only `select` (and only
staff, via RLS). A generic trigger, `app.audit_row_change`, records every
insert, update and delete on business tables in the same transaction, with the
acting user (`auth.uid()`), the database role, and a before/after diff of
changed columns. Status changes are named `<entity>.status.<new status>`.
Because it is a trigger, there is no code path that changes data without an
audit entry.

## Files

- Upload: the server action reads the file, checks size (≤ 10 MB) and file
  signature (PDF, JPEG or PNG by magic bytes; the browser's type and file
  name are ignored), sanitizes the display name, generates the storage path
  (`org/<id>/<uuid>.pdf`), inserts the metadata row under RLS, then writes the
  object, all in one transaction. A refused row never reaches storage and a
  failed write rolls the row back.
- Storage: a private Supabase bucket with no policies for `anon` or
  `authenticated`; only the server's service role key can reach it.
- Download: `/api/documents/[id]` looks the row up under RLS and streams the
  file with `Cache-Control: private, no-store`, `nosniff` and a sandboxing CSP.
- Development: `FILE_STORAGE_DRIVER=local` writes under `.data/uploads`
  (gitignored) and is refused when `NODE_ENV=production`.

## Security notes

- Secrets live only in `.env.local` / the host's secret store; `.env*` is
  gitignored except `.env.example`. The service role key and `DATABASE_URL`
  are read only in `server-only` modules.
- Sessions are validated with `supabase.auth.getUser()` (a round trip to the
  auth server) rather than trusting the cookie.
- Redirect targets (`next`) are restricted to same-origin paths.
- Sign-out is POST-only; auth cookies are SameSite=Lax.
- Security headers: `X-Frame-Options: DENY`, `nosniff`, strict referrer,
  restrictive `Permissions-Policy`. A full CSP is a follow-up.
- Server Action and proxy body limits are 11 MB to allow 10 MB uploads.

## Testing

| Suite | Command | Needs |
| --- | --- | --- |
| Unit | `pnpm test` | nothing |
| Database integration | `pnpm db:test:reset && pnpm test:db` | any Postgres 15+; `TEST_DATABASE_URL` with "test" in the db name |
| End to end | `pnpm test:e2e` | the app running against Supabase (local or hosted test project) |

Database tests run the real migrations on plain Postgres with a small shim
(`supabase/tests/plain-postgres-bootstrap.sql`) that provides the Supabase
roles and an `auth.uid()` identical in behavior to Supabase's. They exercise
RLS, grants, workflow functions and audit triggers as different users.

End-to-end tests sign up through the UI, confirm the email through the auth
admin API when confirmation is on, and drive the contractor → staff approval
and worker flows on a phone-sized and a desktop viewport.

## Environments

- **Local:** `pnpm supabase start` (Docker) provides Postgres, Auth, Storage
  and an email inbox at http://127.0.0.1:54324; `supabase db reset` applies
  migrations and `seed.sql`.
- **Production (proposed):** Vercel for the app, Supabase for Postgres, Auth
  and Storage. `DATABASE_URL` should use Supabase's transaction pooler
  (postgres.js runs with `prepare: false` for this). Migrations are applied
  with `supabase db push` from CI after review.
