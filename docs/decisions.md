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

## D-021 Notifications are written by database triggers, in the app only

Applications, offers, bookings, staff review decisions and accepted
invitations notify the people affected through triggers on those tables, so
every path that changes them (contractor, worker or staff) notifies the
same way. Nobody is notified about their own action. Job messages keep one
unread notification per person per job, updated with the latest message.
Notifications are shown in the app only.

- **Why:** one place for the rules, impossible to forget in a new action.
- **Cost:** email and SMS need a provider and are a later step; they will
  read from the same table.

## D-022 Job threads are shared by the business, booked or offered workers, and staff

Each job has one thread. Applicants who were not offered the job cannot see
it, and a worker whose booking is cancelled loses access. Message text is
read through `job_thread()` so staff can hide a message from everyone but
staff without deleting it (the audit log keeps it).

## D-023 A written design standard with shared tokens and components

`docs/design.md` sets the visual rules (neutral surfaces, navy primary,
small radii, borders instead of shadows, tables for comparable lists) and
the components that implement them. New screens use those components
rather than one-off styles.

## D-024 Customers request work; contractors quote privately; the customer awards one

An approved customer posts a service request (category, town, dates,
optional budget). Approved contractors that list that category and town,
or that the customer invited, can see it and quote. Each contractor sees
only its own quote; the customer sees all of them. Accepting a quote awards
the request and declines the others. The street address and on-site contact
are shared only with the customer, staff and the awarded contractor, the
same rule as job sites.

- **Why:** customers get comparable prices without contractors bidding
  against each other's numbers, and addresses are not spread to every
  contractor in a town.
- **Quoting needs the same standing as staffing:** an approved contractor
  with a reviewed, unexpired general liability certificate.
- **Not yet:** no money moves. Invoices, fees and payments are Step 5;
  reviews and disputes are Step 4. (Request threads and project delivery
  followed in D-026.)

## D-025 A marketing site built from the real product

The public homepage shows screens captured from the running app with
example data (`.review/marketing.mts` seeds a clean database and writes
`public/marketing/*.webp`), labelled as such. Claims are limited to what the
platform enforces today; planned checks (ratings, identity and background
checks, payments, email and text alerts) are listed separately as not yet
available. No testimonials, logos, metrics or pricing until they are real.

- **Identity:** a "Q" mark with a signal-orange tail; orange is a marketing
  accent for marks and small highlights only (text uses `signal-ink`), never
  a status color in the app. Ink, white and warm off-white (`paper`) carry
  the pages.
- **Cost:** product screens must be recaptured when the app's look changes.

## D-026 An awarded request becomes a project the contractor staffs and the customer confirms

After a customer awards a request, the winning contractor schedules jobs
for it (`jobs.service_request_id`) and staffs them through the existing job
workflow. Only the awarded contractor can link a job, and only while the
work is in progress. The customer follows the work on the request page:
each job's staffing, and who checked in and out (names and times only;
workers' contact details stay with the contractor). The two businesses
have a message thread on the request. Workers never see the customer's name
or the quote.

- **Completion is two-sided:** the contractor reports the work complete once
  every job on the project is completed or cancelled (at least one
  completed); the customer confirms it, or sends it back with a reason.
  Customers can no longer close awarded work on their own. Staff can close
  an awarded request directly when a customer can't confirm, and the
  history records that staff did it.
- **History:** each step is written to `service_request_events` by database
  triggers and workflow functions, readable by the customer, the awarded
  contractor and staff. People cannot write to it.
- **Requirements:** requests carry an optional requirements field (badges,
  hours, certifications) that contractors see before quoting.
- **Not yet:** invoices and payments (Step 5), reviews and disputes (Step 4).

## D-027 The awarded contractor can subcontract part of a project to another approved contractor

"Subcontractor" here means a business, not a worker: the contractor that
won a project (the prime) offers part of it, a written scope and an
optional agreed price, to another approved contractor in the same market
with a current, reviewed general liability certificate. The subcontractor
accepts or declines. Once accepted it sees the project details and site,
schedules and staffs its own jobs for the project through the normal job
workflow, and reports its part complete. The prime reports the whole
project complete only after every live subcontract is completed or ended.

- **Visibility:** the customer sees which businesses are on the project,
  their scope, jobs and attendance, never the subcontract price. The prime
  sees its subcontracts, prices and the subcontractors' jobs (not their
  job pages). A subcontractor sees only its own jobs, its own part of the
  history, and its own thread with the prime: not the customer's award
  price, other crews, or the customer–prime thread. Enforced in the
  database (`project_subcontracts`, `request_jobs`, event and message
  policies), not just the screens.
- **Ending:** either business can end a subcontract with a reason, once the
  subcontractor has no open jobs on the project.
- **Money:** the agreed price is a record between the two businesses.
  QuickPro does not invoice or pay subcontracts; that waits for payments
  (Step 5) and is said in the product.
- **Workers** are unaffected: they apply to the subcontractor's job like any
  other and see that business's name, never the customer's.

## D-028 Two-way, double-blind reviews and staff-closed disputes on every piece of agreed work

Three kinds of work can be reviewed and disputed, each between two sides:
a project (customer and awarded contractor), a subcontract (prime and
subcontractor) and a shift (the business and the booked worker).

- **Reviews:** each side writes one review (1–5 stars, text optional
  except at 1–2 stars) within 14 days of the work finishing. Neither side
  sees the other's review until both have written one or the window
  closes, so neither can retaliate. Businesses review through owners,
  admins and dispatchers; workers review for themselves.
- **Who sees what:** review text is seen by the author, the subject and
  staff; there are no public profiles yet. Averages of published, visible
  reviews show where a choice is made: customers see contractors' ratings
  in the directory and invite list, primes see subcontractors' ratings,
  dispatchers see applicants' ratings, and contractors see a customer's
  rating on its requests.
- **Moderation:** the subject can reply once and flag a review; staff hide
  it (it stops counting, and both sides see the reason) or keep it. Staff
  don't edit reviews.
- **Disputes:** either side can raise one about agreed work (awarded,
  accepted or booked) up to 90 days after it finished, with a reason, what
  happened and what would put it right. The two sides and staff discuss it
  on its own thread; the opener can withdraw it; staff close it with an
  outcome (resolved between the sides, upheld, partly upheld, not upheld)
  and a note both sides see. Project disputes appear in the project
  history; subcontract and shift disputes stay between their two sides.
- **Money:** QuickPro doesn't hold or move money yet, so an outcome is a
  record, and refunds or pay corrections are arranged between the parties.
  The product says so on every dispute. Payments (Step 5) can act on
  outcomes later.
- Enforced in the database: who may review, publication, visibility and
  every status change go through functions; the tables are not writable by
  `authenticated`.

## D-029 Invoices between businesses before payments

The business that does the work bills the business it works for: the
awarded contractor invoices the customer, and a subcontractor invoices the
prime. Workers are never invoiced or paid here (D-009); their pay stays with
the business that engages them.

- **Lifecycle:** a draft, private to the issuer's team and prefilled with
  what is left of the agreed price (the accepted quote or the subcontract
  amount), is edited and then issued. Issuing gives it the next number in
  the issuer's own sequence (INV-0001…) and freezes it. The issuer marks it
  paid (date, method, reference) when the money arrives, or voids it with a
  reason the other business sees. Drafts are discarded by voiding, so
  nothing is deleted.
- **Money:** QuickPro doesn't collect, hold or move payments. Every invoice
  and the payer's view say to pay the issuer directly. Card and bank
  payments wait for the merchant-of-record and fee decisions (Phase 5).
- **Totals** are worked out in the database from the line items and the tax
  rate, never taken from the browser. Sales tax is a rate the issuer enters
  (in thousandths of a percent, so Suffolk's 8.625% is exact); QuickPro
  doesn't decide what is taxable.
- **Visibility:** the customer never sees subcontract invoices; staff see
  issued invoices only; drafts stay with the issuer. Enforced by row level
  security and the functions.
- **Delivery:** the recipient gets a QuickPro notification. Email isn't sent
  yet, so the invoice prints cleanly (or saves as PDF) from the browser.

## D-030 Staff market analytics from live tables, no new schema

Staff get a market analytics page (Staff → Analytics) for one market over
the last 7, 30, 90 days or 12 months, optionally narrowed to one category:
projects posted, quoted and awarded (with value), shift fill rate and time
to fill, check-ins, what contractors invoiced and marked paid, reviews and
disputes, approved businesses and workers, breakdowns by category and
town, coverage gaps (category and town pairs customers asked for that no
approved contractor covers), weekly or monthly charts, and a CSV export.

- **No migration.** Every number is a read-only query run as the signed-in
  staff member; row level security already lets staff read these tables.
  The data layer refuses anyone who isn't staff, and the page and export
  return not found to them.
- **Counted, not estimated.** Definitions are in `src/server/data/analytics.ts`
  and on the page ("How these are counted"). Money is what contractors
  invoiced and marked paid; QuickPro still doesn't move money (D-029).
- **Fill rate** counts shifts that have started (not cancelled), so future
  shifts that are still filling don't drag it down. Time to fill runs from
  posting to the booking that filled the last position.
- **Later:** pre-aggregated tables or a reporting replica if the queries get
  slow at volume; finer staff roles (finance, support) for who sees money.

## D-031 Support requests to QuickPro staff

Anyone signed in (customers, contractors, subcontractors, workers) can ask
QuickPro staff for help from Help and support in the account menu. A request
has a topic, a subject, a description and, optionally, which of the person's
businesses it's about. Staff work a queue (Staff → Support) and the staff
overview counts requests waiting on them.

- **Conversation:** the person and staff reply on the request. Staff can add
  internal notes that the person never sees (row level security hides them,
  not just the page). Staff names are shown to staff only; the person sees
  "QuickPro support".
- **Status:** open (waiting on staff), waiting (staff replied, waiting on the
  person) and resolved. A staff reply moves it to waiting and assigns it to
  that staff member if nobody has it; the person's reply moves it back to
  open. Either side can resolve it, and the person can reopen it by replying
  within 30 days. After that they open a new one.
- **Priority:** safety requests come in urgent and the page says to call 911
  first if someone is in danger. Staff can change priority and assignment.
- **Notifications** are in-app only (no email provider yet). Nothing is
  deleted; there are no delete paths. Limits: 10 requests a day per person,
  10 messages a minute.
- **Not yet:** attachments, email in and out, canned replies, response-time
  targets. Nothing on the page promises a response time.

## D-032 Public contractor profiles

An approved contractor's owners and admins can publish a public profile page
at /contractors/<address> from the business profile. It is opt-in and off by
default. Published, approved contractors in open markets are listed in a
public directory at /contractors, filterable by service and town, which
links to the customer sign-up to request a quote.

- **What's public:** business name, city, about text, services, towns, years
  in business, crew size, rating, completed project count, and published
  reviews from customers and primes. Reviewers are described ("Customer in
  Islip"), never named. Worker reviews of the business stay inside QuickPro.
  Whether a current liability certificate has been reviewed by staff is shown
  as exactly that, not as "insured" or "verified".
- **What's never public:** phone, email, address, legal name, documents,
  people, prices and quotes. The anonymous role reads no tables. Signed-out
  pages call `withAnon`, which can only run `public_contractors`,
  `public_contractor` and `public_contractor_reviews`. Those are
  security-definer functions that return only the fields above.
- **Taking it down:** unpublishing sets `is_published` to false and the page
  returns 404 straight away. A suspended or no-longer-approved business drops
  out on its own. Nothing is deleted.
- **Not yet:** photos, custom contact forms, search engine sitemaps, and
  inviting a profile's business to quote straight from the page (a customer
  signs up and invites it from the directory in the app).

## D-033 Week schedules for contractors and workers

Contractors get Schedule (next to Jobs) and workers get Schedule (next to My
jobs): a Sunday-to-Saturday week in New York time, with the week in the
address (`?week=YYYY-MM-DD`) so it can be bookmarked or shared within the
business. Phones show a list of days with empty days folded to one line;
wide screens show seven columns.

- **Contractor:** every job starting that week except cancelled ones, with
  booked/needed, the booked people's names, offers out and applicants. Jobs
  still short of people are amber, or red within 48 hours of the start. A
  summary counts jobs, shifts filled, shifts still to staff and crew hours.
- **Worker:** their booked and worked shifts and offers still waiting for an
  answer (an offer drops off once the shift starts or fills), their usual
  availability on each day, and hours and estimated pay at posted rates
  before taxes.
- **Calendar file:** workers can download their booked shifts for the next
  90 days as an .ics file with site addresses (readable to them once booked).
  It's a one-time download, signed in, not a subscription URL: a feed link
  that works without signing in would need a revocable secret token, which
  can come later.
- No database change. The pages read through row level security and the
  existing `job_people` function, which only the business and staff can call.

## D-034 Job checklists

A job can have a checklist of what has to be done on site, up to 30 items.
Owners, admins and dispatchers add and remove items while the job is open or
filled. The booked crew (workers who accepted the shift) see it on their job
page and can check items off, or undo, once they've checked in, until two
hours after the shift ends. Dispatchers can check items off too (for example
after a walk-through) until the job is marked complete. Each item records who
checked it and when, with an optional short note.

- **Who sees what:** the business and staff see who checked each item; the
  crew see "Done by you" or just "Done". Applicants and other workers see
  nothing.
- **Notifications:** when the crew check off the last item, the business's
  dispatchers get an in-app notification, once per job.
- **Nothing is deleted.** Removing an item marks it removed and keeps the row,
  so the record of what was asked for stays. Completed and cancelled jobs'
  checklists are read-only.
- **Not a gate:** an unfinished checklist doesn't block marking the job
  complete; the business decides.
- **Not yet:** photo proof of completion (needs private storage for job
  photos), reusable checklist templates, and reordering items.

## D-035 Job photos as proof of work

The booked crew can add photos to a job once they've checked in, until two
hours after the shift ends; the business's owners, admins and dispatchers
can add them while the job is open or filled. A photo can have a caption and
be tied to a checklist item. Up to 40 photos per job, JPEG or PNG (checked by
the file's bytes, not its name), at most 10 MB.

- **Storage:** the same private Supabase Storage bucket as qualification
  documents, under `job/<job id>/<photo id>.<ext>`, so there is no new bucket
  to configure. Rows and files are written together the same way as
  documents (D-011 and the document store): a failed write leaves neither,
  and `pnpm storage:reconcile` now also covers `job/`.
- **Access:** files are served only by `/api/job-photos/<id>` after a row
  level security check; the business, the booked crew and staff can see
  them. Applicants and other workers can't. Responses are privately cached
  for five minutes so the grid doesn't refetch on every visit.
- **Removing:** the person who added a photo (while they still could add
  one) or a dispatcher (while the job is open) can take it off the job. The
  row and file stay, visible to QuickPro staff only; nothing is deleted.
- **Not yet:** thumbnails (the grid loads the full image, fine for phone
  photos but heavier than needed), video, and sharing photos with the
  customer on the project page.
