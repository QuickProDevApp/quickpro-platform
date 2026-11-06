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
  photos but heavier than needed) and video. Sharing with the customer was
  added in D-036.

## D-036 Customers see shared photos and checklist progress

A customer following an awarded project now sees the work itself, not only
who checked in. Two things are added to the customer's project page:

- **Shared photos:** job photos stay private to the business and the booked
  crew (D-035) until one of the awarded contractor's owners, admins or
  dispatchers chooses "Share with customer" on it. Sharing is a database
  function (`share_job_photo`); the new `shared_at`/`shared_by` columns
  are not writable by clients, and new photos always start unshared. The
  contractor can stop sharing at any time, and taking a photo off the job
  also takes it off the customer's page. The customer sees the caption, the
  checklist item, the job and the date, never who took it. The file is
  served by the same `/api/job-photos/<id>` route, which now also accepts a
  shared photo for anyone who can see the project (`shared_job_photo_file`).
  The customer's dispatchers get one notification per job at most every six
  hours, so sharing a batch of photos doesn't flood them.
- **Checklist progress:** each job on the project shows "N of M done" with
  the items on demand (labels and done state only; no names or notes). It
  has the same reach as the project's job list: the customer, the awarded
  contractor and staff see every job; a subcontractor sees its own.

Only the awarded contractor can share, and only on jobs it runs. A
subcontractor's photos are not shared with the prime's customer in this
version, because the subcontractor's relationship is with the prime; the
prime and the subcontractor can exchange photos in their own thread.

The contractor's project page shows what the customer sees, so there is no
guessing about what was shared. Migration `20261111000100_shared_job_photos`
adds two nullable columns and functions; it deletes and drops nothing.

- **Not yet:** letting a subcontractor share through the prime, and the
  customer commenting on a specific photo (they can use the project thread).

## D-037 Availability matching

Workers set weekly availability when they build their profile, but until now
nothing used it. A shift is now compared with it, in New York time:

- **Fits** when the worker's windows on that weekday cover the whole shift.
  Windows that touch (07:00-12:00 and 12:00-17:00) count as one. A shift
  that runs past midnight never fits, because availability is set per day.
  No availability that day means it doesn't fit.
- **Booked elsewhere** when the worker has accepted another live job that
  overlaps, the same rule that already stops them accepting two such offers.

Where it shows:

- **Workers:** each open job on Find work is marked "Within your
  availability", "Outside your availability" or "Clashes with a shift you
  booked", and a "Fits my availability" filter hides the rest. The job page
  says the same above the Apply form. They can still apply to anything.
- **Businesses:** applicants and offered workers are marked "Within their
  availability", "Outside their availability" or "Booked on another job
  then", so an offer isn't sent to someone who can't take it.
- **Staff matching:** candidates in the job's town come first, then those
  free at that time and within their hours, then by matching skills.

Privacy: the answers are yes/no. A worker's actual hours stay visible only
to them and staff. A business can ask only about workers who applied to or
were offered one of its jobs, and only for that job; for anyone else the
functions return null.

Migration `20261112000100_availability_matching` only adds functions; it
deletes and drops nothing. Travel distance is still not used.

## D-038 Timesheets: hours approved by the business, for its own payroll

Check-in and check-out were recorded but never turned into hours anyone
could pay from. Each booked shift that has ended (or where the worker
checked out) now has a timesheet:

- **Business (owners, admins, dispatchers):** a Timesheets page by week,
  with what needs approval first. Approve the recorded hours in one tap, or
  adjust the start, end and unpaid break. A change of more than five
  minutes from the worker's own check-in or check-out, or a shift with no
  check-in, needs a note the worker sees. Times must be within 12 hours of
  the scheduled shift, at most 24 hours long and not in the future. Members
  can see the page; only dispatchers approve. Approved hours for the week
  export as CSV for the business's payroll.
- **Worker:** a Timesheets page with approved hours and an estimate of gross
  pay at the job's rate, before taxes. For 30 days after approval they can
  question the hours with a note; the business's dispatchers are told and
  approve again. Their question stays on record.
- **Data:** `timesheets` keeps one row per shift, with the pay rate copied
  at approval. It's written only by `approve_timesheet` and
  `query_timesheet`, with an audit trigger. Workers see their own rows,
  business members theirs, and staff all of them.

Honesty: QuickPro doesn't run payroll or move money. The pages say pay is
an estimate of gross pay and that the business pays through its own
payroll, consistent with D-009 (the business that engages the worker is
the employer of record or arranges the engagement).

Migration `20261113000100_timesheets` adds a type, a table and functions;
it deletes and drops nothing.

- **Not yet:** overtime rules, payroll provider integrations, and the
  worker signing off on hours (they question them instead).

## D-039 Notification emails through an outbox and a narrow mailer role

Every in-app notification is now also emailed to the person's sign-in
address, with a link back to the page it's about and a link to turn emails
off. Nothing about who is notified changed: the database functions that
already create notifications decide that.

- **Outbox:** `notifications` gains an email state (pending, sending, sent,
  skipped, failed). A trigger sets new rows to pending, or skipped if the
  person turned emails off. Emails older than a day when the mailer first
  sees them are skipped, so connecting a provider later doesn't send a
  backlog. Failures are retried up to five attempts; a send that crashed is
  claimed again after ten minutes.
- **Mailer role:** the app drains the outbox as `quickpro_mailer`, a no-login
  role the server switches to per transaction (`withMailer`), like it does
  for `authenticated`. It can only call `app.claim_email_batch` and
  `app.finish_email`; it can't read tables or use people's functions, and
  signed-in people can't call those two. Tests cover both sides.
- **Delivery:** after each signed-in request's response (Next.js `after()`),
  the server sends what's queued, one drain at a time per process. A
  scheduler can also call `POST /api/cron/deliver-emails` with
  `Authorization: Bearer $CRON_SECRET`; without the secret the route is off.
  `EMAIL_DRIVER` is `none` (default: queue only, screens don't promise
  email), `log` (development: files under `EMAIL_LOG_DIR`), or `smtp`
  (`SMTP_URL`, through nodemailer). CI sends real SMTP to the local Supabase
  inbox and the browser test reads it from there.
- **Setting:** Account has an email on/off switch (`set_email_notifications`,
  audited). Turning it off also skips what's still waiting. When no provider
  is configured the card says QuickPro isn't sending email yet.

Production needs a mail provider (SMTP credentials) before any of this is
sent, which may cost money, so it isn't configured. Text message alerts
aren't built: they need a paid SMS provider and approval.

Migration `20261114000100_email_notifications` adds columns, a table, a role
and functions; it deletes and drops nothing.

## D-040 Card payments on invoices through Stripe Connect, test mode only

Invoices (D-029) can now be paid by card. Asked for in test mode with no
real charges, so the app refuses live Stripe keys (`sk_live_`/`rk_live_`)
and ignores live-mode webhook events.

- **Model:** Stripe Connect with Express accounts. A contractor's owners
  and admins open Stripe's hosted onboarding from **Card payments**; Stripe
  verifies the business and bank account on its own pages. The payer's
  owners, admins and dispatchers pay an issued invoice on Stripe Checkout.
  The charge is a destination charge `on_behalf_of` the contractor, so the
  contractor is the settlement merchant and gets the money on Stripe's
  payout schedule. QuickPro never sees card or bank numbers and takes no
  application fee. Workers are still never paid here (D-009).
- **Confirmation:** an invoice is marked paid only by a signed Stripe
  webhook (`checkout.session.completed` with `payment_status = paid`, for the
  amount that was started), never by the browser coming back. Events are
  recorded once in `stripe_events`; a redelivery is a no-op. A payment that
  arrives after the invoice was voided or marked paid leaves the invoice
  alone and tells the contractor to refund it in Stripe.
  `account.updated` keeps the connected account's state current.
- **Database:** `stripe_accounts`, `invoice_card_payments` and
  `stripe_events`, with RLS, column grants (members see the account's state,
  not its Stripe id) and audit triggers. The server records what Stripe
  reported as `quickpro_payments`, a no-login role that can only call
  `app.payments_save_account`, `app.payments_open_checkout` and
  `app.payments_handle_event`, like the mailer role in D-039. Who may set up
  payouts or pay is decided by `payout_setup_account` and
  `card_payment_target`.
- **Configuration:** `STRIPE_SECRET_KEY` (test key), `STRIPE_WEBHOOK_SECRET`,
  optionally `STRIPE_CONNECT_WEBHOOK_SECRET`. Without a key the screens say
  card payments aren't available and invoices work as before.
- **Testing:** database tests sign events with Stripe's own signing scheme
  and check signatures, tampering, live events, idempotency, amounts and
  permissions. The browser test runs against `e2e/stripe-stand-in.mjs`, a
  local stand-in that answers the Stripe API calls the app makes and sends
  signed webhooks; it has not been run against Stripe's real test mode,
  which needs a Stripe test key and a webhook endpoint in a test-mode
  Stripe account.

Still to decide before live payments: whether QuickPro charges a fee, who
bears Stripe's processing fee (with destination charges it falls on the
platform unless an application fee covers it), ACH, and refunds and
disputes from inside the app.

Migration `20261115000100_card_payments` adds a type, tables, a role and
functions; it deletes and drops nothing.

## D-041 Questions before the award, private to each contractor

Customers and contractors couldn't talk until a quote was accepted, so a
contractor had to quote blind and a customer couldn't ask about a quote.
While a request is open, the customer and each contractor that can see it
(serves that service and town, or was invited) now have a private thread on
the request.

- **Who:** owners, admins and dispatchers of the customer and of that
  contractor write; other members of either business read. Each contractor
  sees only its own thread; other contractors never see the questions or
  the answers, so nobody learns a rival's price or approach. Staff can read
  for support but don't write in it.
- **Starting one:** a contractor asks from the request page. The customer
  replies in that thread, or starts one with a contractor that quoted or was
  invited.
- **Closing:** accepting a quote or cancelling the request closes every
  thread. Each side keeps reading its own; the winning contractor carries on
  in the project thread (D-026).
- **Notifications:** the other side's dispatchers get one unread
  notification per thread, kept up to date, and an email when email is set
  up (D-039).
- **Enforced in the database:** `request_quote_messages` has RLS, column
  grants (the text is read only through `quote_thread`) and an audit
  trigger; `post_quote_message` checks the side, the role, the request's
  status and the contractor's visibility, the text, and a rate limit.

Migration `20261116000100_quote_questions` adds a table and functions; it
deletes and drops nothing.


## D-042 Construction and skilled-trade services

QuickPro is positioned as a marketplace for commercial construction, skilled
trades and the crews behind them, not only building services. The service
list had only commercial cleaning, pressure washing, landscaping and
facility services, so a customer couldn't post (and a contractor couldn't
list) the construction work the site now describes.

- **Added:** general construction and labor, carpentry, painting and
  drywall, flooring installation, and masonry and concrete, each with the
  skills workers list for it (framing, finish carpentry, doors and hardware,
  taping and finishing, tile setting, concrete finishing and so on). The
  existing services stay.
- **Not added:** electrical, plumbing and HVAC. They need an individual
  license in Suffolk County and QuickPro doesn't check licenses, so listing
  them would suggest it does. They wait for license verification.
- **Skills are what a worker says they do**, reviewed with the profile by
  staff; none of them is a credential (no "OSHA 10" or "licensed" skills).

Migration `20261117000100_construction_trades` inserts reference rows only
(skipping slugs that exist); it changes, deletes and drops nothing.

## D-043 Presentation design and the demo environment

For demonstrations to investors, contractors and workers the product needed
a distinctive identity and a way to show the whole journey with records that
are clearly not real activity.

- **Identity:** charcoal (#242B31), warm off-white (#F7F6F2), slate
  (#66737D, darkened a step to #5E6A74 for body text so it passes 4.5:1 on
  every surface) and construction orange (#D97835) as the accent; the
  text-safe orange (#A9531B) carries links and focus rings. The app bar and
  the footer are charcoal; pages stay light. Headings on the public site and
  sign-in pages use Source Serif 4 (SIL Open Font License, bundled in
  `src/fonts`); the app keeps Geist. No stock photography yet: the site shows
  real product screens only (see "Still open").
- **Demo environment:** `DEMO_MODE=on` puts a "Demo environment" banner on
  every page ("example records, Stripe test mode, no real money").
  `pnpm demo:seed --confirm=<database host>` adds a labeled data set (a
  property manager, a general contractor, two rivals, a drywall
  subcontractor, five tradespeople and a staff account, all at
  `@demo.quickpro.test`) with three projects at different stages: open with
  quotes and questions, in progress with a subcontract and booked crew, and
  confirmed with an unpaid invoice. It refuses to run unless `DEMO_MODE=on`
  and the host is confirmed, only adds records, writes approvals and shift
  times directly (as a review or the day of the work would) and does
  everything else through the workflow functions as the person who would do
  it. Insurance documents it stores are PDFs that say they are not
  certificates. Card payment is left to the demo, in Stripe test mode.
- **Marketing screens** come from that data set (`.review/marketing-shots.mts`,
  local tooling) and are captioned as demo data.
- **Still open:** licensed construction photography. The cloud environment
  can't reach image libraries, so photos need to be supplied or the
  environment's network allowance widened.

## D-044 A shareable preview demo, deployed by workflow

The demo has to run on a hosted preview, not only on a laptop, without
touching production or real money.

- **Where:** the QuickPro Preview Supabase project and a protected Vercel
  preview, both through the manual workflows (`docs/deployment.md`). Nothing
  targets production.
- **Migration guard:** the workflow used to stop on every `delete from`,
  including the one inside `public.remove_member`, which deletes a single
  membership only when a signed-in owner, admin or the member calls it, and
  never the last owner. Instead of loosening the pattern, reviewed lines are
  listed exactly (`file:line:text`) in
  `supabase/checks/reviewed-destructive-statements.txt` with the reason in
  `supabase/checks/README-reviewed.md`; any other match, or an edit to a
  listed line, still stops the run.
- **Demo data:** `DEMO_MODE=on` on the preview and the labeled data set
  (D-043), added only when the database has no demo accounts yet.
- **Payments:** Stripe test mode only, from a `STRIPE_TEST_SECRET_KEY`
  secret; the workflow refuses live keys, and the app refuses them too
  (D-040). Webhooks reach the protected preview with Vercel's bypass
  parameter in the endpoint URL, which is stored only in the Stripe test-mode
  dashboard.
- **Proof on the preview:** the journey tests run against the deployed URL
  on phone and desktop. The card test pays on Stripe's real Checkout page
  with the 4242 test card and waits for Stripe's signed webhook to settle
  the invoice. It checks that payout setup reaches Stripe's hosted
  onboarding but does not fill that form in; the paying business gets its
  test-mode account through the Stripe API with Stripe's test identity
  values.

## D-045 A bright marketplace identity, replacing the editorial look

The owner asked for QuickPro to read as a modern two-sided marketplace (in
the spirit of service-discovery and booking apps) rather than an editorial
or clinical site, and for any influence of the DocFi reference used earlier
to go. D-043's warm off-white, serif headings and charcoal app bar are
replaced; features and copy rules are unchanged.

- **Palette:** white and cool light-gray surfaces, near-black ink, QuickPro
  orange (#C2410C) for primary buttons with white text (5.2:1) and links,
  bright orange (#F26A1F) for marks only. Dark charcoal stays for the
  footer and a few contrasting bands.
- **Type:** Geist everywhere; the bundled serif is removed.
- **Mark:** a white "Q" ring on an orange tile. The Next.js starter
  favicon, left over from the first commit, is replaced by `app/icon.svg`.
- **Homepage:** search by service and town into the existing public
  directory, popular services, a service grid, and how it works for each
  side. Every control leads to an existing page; nothing new is claimed.
- **App:** a white header with an orange active underline; the business
  tabs are in workflow order (requests, jobs, schedule, timesheets,
  invoices, payments) with settings last.
- **Demo data:** the demo contractors now publish their public profiles,
  with a town, years in business, crew size and a description that says it
  is example data, so the directory and the homepage search return them.
- **Still open:** licensed photography (this environment can't reach
  image libraries).
