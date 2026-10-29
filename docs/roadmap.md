# QuickPro roadmap

Sequencing follows the contractor-first launch: solve a staffing and
coordination problem contractors already have, run matching by hand through
the admin dashboard, and only then open customer-driven discovery. Each phase
ends with lint, typecheck, tests, build, and a written summary of what was
built, what is incomplete, and how to test it.

## Phase 1: Foundation (built; see product-spec.md for acceptance criteria)

Accounts, organizations and memberships, contractor and worker profiles,
customer registration, qualification documents with private storage, staff
review workflows, audit log, admin overview. Reference data for Suffolk and
Nassau.

## Phase 2: Staffing requests and concierge matching (modules C, D)

The first thing contractors will pay attention to: "I have a job Saturday and
need three more people."

- Team: invite members to a contractor org (owner, admin, dispatcher, member).
- Staffing request: a contractor posts shifts (date, time, site town, skills,
  headcount, pay rate, and the **engagement basis**: who engages the worker and
  how, chosen from options configured after legal review).
- Matching: workers see shifts that fit their skills, areas, travel and
  availability and apply; contractors and staff shortlist; staff can match by
  hand from the admin dashboard and see unfilled shifts at risk.
- Assignment: the contractor confirms, the worker accepts; both see the
  roster. Worker work history begins here.
- Notifications: transactional email (and SMS later) for applications,
  confirmations and changes, through a real provider.
- Admin metrics: fill rate, time to fill, open shifts by town and category.

## Phase 3: Job management and crew coordination (modules D, E)

- Contractor jobs: site, schedule, crew, checklist.
- Day-of: check-in/check-out with timestamps, notes and photos as proof of
  completion (private storage, same file rules as Phase 1).
- Messaging threads per job and per shift, with staff moderation.
- Calendar views for contractors and workers.

## Phase 4: Customer requests and quotes (modules A, B)

- Customers submit job requests (scope, site, schedule, budget).
- Matching to approved contractors by category and area; staff can route.
- Contractors quote; customers compare and book; booking becomes a job.
- Reviews after completion, with staff moderation.
- Public contractor profiles for approved businesses only.

## Phase 5: Payments and invoicing (module F)

Only once the legal and operational model is settled (who is the merchant of
record, fee structure, worker pay flows).

- Stripe Connect accounts for contractors, test mode first.
- Invoices from completed jobs; customer payment; payouts per Stripe's
  schedule (no "instant payout" claims unless enabled and configured).
- Webhooks with signature verification and idempotency; ledger tables.

## Phase 6: Operations, analytics, expansion (module G)

- Disputes and support tickets.
- Market and category dashboards for staff.
- Opening Nassau County: flip `markets.is_active`, review service areas.

## Known follow-ups

- Next.js Cache Components are off for now (see decisions.md, D-006).
- Act automatically when an approved contractor's insurance lapses (with Phase 2 assignments).
- Schedule `pnpm storage:reconcile`.
- Password reset and email change.
- Document expiry reminders (needs a scheduler and email provider).
- Staff roles finer than "admin" (reviewer, support, finance).
