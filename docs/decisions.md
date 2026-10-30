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

## D-012 Contractor approval requires reviewed, unexpired insurance (PR #1 review)

`review_organization` refuses to approve or reinstate a contractor unless a
general liability certificate has been marked reviewed by staff, has an
expiration date, and has not expired. Staff cannot mark an insurance
certificate reviewed without an expiration date, or once it has expired.
Submission still only needs a pending or reviewed certificate, so a
contractor can submit before staff look at it.

- **Why:** approval must mean a person checked the certificate, not that one
  was uploaded. It is still a staff review, not verification with the
  insurer (D-008).
- **Cost:** a certificate that lapses after approval does not demote the
  contractor automatically yet (see phase-1-status.md); it is surfaced to
  staff instead.

## D-013 Material changes to approved profiles go back to review

Database triggers return an approved contractor or worker to
`pending_review`, recording why in `rereview_reason`, when the owner:

| Change | Contractor | Worker |
| --- | --- | --- |
| Business name or legal name | yes | n/a |
| Adds a service category / skill | yes | yes |
| Full name on the account | n/a | yes |
| Moves market | blocked: staff only once submitted | n/a |

Not re-reviewed: contact details, address, description, crew size, years in
business, removing categories or skills, service areas inside the market,
travel, rate and availability. Insurance changes are reviewed per document.
While in review or suspended, names cannot change at all. Staff edits never
trigger re-review. The next staff decision clears the reason.

- **Why:** approval covered what staff saw. Adding work types or changing who
  the business is changes that; routine edits do not, and re-reviewing them
  would bury staff.
- **Cost:** an approved business loses approved status until staff act; the
  page explains why. Revisit with Phase 2, when status affects live shifts.

## D-014 Uploads: row and object kept consistent without a shared transaction

Postgres and Storage cannot commit together. The upload inserts the row
(under RLS) and writes the object inside the same database transaction, so a
refused row never reaches storage and a failed write rolls the row back. If
the transaction fails after the object was written, the object is removed. If
that cleanup also fails, the object is logged as an orphan.
Deletes remove the row first, then the object; a failed object delete leaves
an orphan, never a row pointing at nothing. `pnpm storage:reconcile` lists
objects with no row (older than a grace period) and removes them, and reports
rows whose object is missing (it never deletes rows). The download route
returns a clear 404 for a missing object.

- **Why:** the worst case is a private, unreferenced file, which is cleaned up
  later, instead of a document that appears uploaded but cannot be opened.
- **Cost:** reconciliation has to be run (manually for now).

## D-015 Service areas must belong to the market, enforced in the database

Triggers reject a contractor service area outside the organization's market,
a market move that would leave areas behind or target a closed market, and
worker home or preferred areas outside an open market.

- **Why:** the UI only offers the right towns, but the rule protects data
  from any code path, including future ones and direct SQL by the app role.

## D-016 Engagement basis is chosen per job from a staff-managed list (needs counsel review)

Every job names an engagement type from `public.engagement_types`, a
reference table that only staff can change (by migration or direct SQL). Two
are seeded, both describing the contractor as the party that engages the
worker: "Employee of the contractor" and "Subcontractor of the contractor".
QuickPro is never the employer in these options. The wording is a placeholder
written for development and **must be reviewed by employment counsel before
any real job is posted**. Retiring an option (`is_active = false`) keeps old
jobs readable and blocks new posts with it.

Each market also has a minimum hourly pay (`markets.min_hourly_pay_cents`,
$17.00 for Suffolk and Nassau, the 2026 Long Island minimum wage as we
understand it). The database refuses a job below it. It is a floor, not
advice on what to pay, and it has to be updated each January.

- **Why:** D-009 keeps classification off the worker. The basis belongs to
  each engagement, and the platform should not invent legal categories in
  code.
- **Cost:** a staff step before launch; the pay floor needs a yearly update.

## D-017 Lapsed insurance blocks new staffing, not existing bookings

Posting a job and sending an offer both require the contractor
to be approved *and* to hold a reviewed general liability certificate that
has not expired (`app.assert_contractor_can_staff`). Editing or cancelling
an existing job is still allowed, so a business can wind work down. A worker can only accept
an offer while the contractor is approved. Bookings already accepted are not
cancelled automatically when a certificate lapses: staff see the job and
decide, because cancelling a worker's shift on the morning of the job is the
worse outcome.

- **Why:** closes the D-012 follow-up ("act when insurance lapses") for the
  part that matters most, new work, without silently breaking existing work.
- **Cost:** staff must watch upcoming jobs of contractors whose insurance is
  about to lapse (no automated reminders yet).

## D-018 Workers see the business, town and pay before applying; the address after booking

Open jobs show the business name, town, time, pay, skills and engagement
basis to approved workers. The street address, on-site contact and arrival
notes (`job_sites`) are readable only by the business, staff and workers who
accepted. The worker's phone number is shown to the business only once the
worker accepts.

- **Why:** workers need enough to decide; addresses and phone numbers are
  shared only when both sides have committed.

## D-019 Team invitations are one-time links, stored only as a hash

An owner or admin creates an invitation for an email address and a role.
The database returns a random 128-bit token once; the app shows it as a link
and the table keeps only its SHA-256 hash, so a leaked row or backup cannot
be used to join. The invitee must be signed in with the invited address to
accept. Invitations expire after 14 days, a new one to the same address
replaces the open one, and there are at most 50 open per organization.
Nobody is invited as owner; an owner promotes someone after they join.
Admins manage dispatchers and members only; owners manage everyone. Every
organization keeps at least one owner. All of this is in database functions
(`invite_member`, `accept_invitation`, `change_member_role`, `remove_member`).

- **Why:** QuickPro does not send email yet (no provider), and a link the
  inviter sends works today without pretending an email went out.
- **Cost:** the inviter has to send the link themselves. When email is
  added, the same token goes into the email instead.

## D-020 Password reset needs the email link, not just a session

The reset link signs the person in through `/auth/confirm`, which also sets
a short-lived httpOnly cookie (`qp_recovery`, 15 minutes). The "choose a new
password" page and action require both a session and that cookie, then clear
it. Signed-in people change their password on the account page by entering
the current one.

- **Why:** without the cookie, anyone with an unlocked signed-in browser
  could set a new password from `/reset-password` without knowing the old
  one.
- **Cost:** Supabase's default reset email uses PKCE, so the link works only
  in the browser that asked for it. The page says so.
