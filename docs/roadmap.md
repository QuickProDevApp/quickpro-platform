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
need three more people." Built in the Phase 2 PR; see phase-2-status.md.

Built:

- Jobs: a contractor posts a job (date, local start and end time, town,
  category, skills, headcount, hourly pay, engagement basis, and a private
  site address and contact). Editable until it starts, with fields locked
  once someone is booked; cancel and complete.
- Discovery: approved workers see open jobs in their towns (or the whole
  market), with matching skills marked, and apply with a note.
- Offers and booking: the business offers the job to applicants, the worker
  accepts or declines, the job fills at headcount and reopens if someone
  cancels. Overlapping bookings are refused.
- Day of: check-in from an hour before the start, check-out after.
- Staff: jobs queue with "unfilled within 48 hours", hand matching of any
  approved worker ranked by town and skills.

- Teams: owners and admins invite people by link with a role (admin,
  dispatcher, member), change roles and remove people; anyone can leave
  except the last owner.
- Accounts: forgot password and reset by email, change password, resend the
  confirmation email.

Not built yet:

- Invitation emails. Invitations are links the inviter sends themselves.
- Notifications: email (and SMS later) for applications, offers and changes,
  through a real provider. Until then the screens say that nothing is sent.
- Admin metrics beyond counts: fill rate, time to fill.
- Travel distance and availability matching (towns and skills only for now).

## Phase 3: Job management and crew coordination (modules D, E)

- Contractor jobs: site, schedule, crew, checklist.
- Day-of: check-in/check-out with timestamps, notes and photos as proof of
  completion (private storage, same file rules as Phase 1).
- Messaging threads per job and per shift, with staff moderation.
- Calendar views for contractors and workers.

## Phase 4: Customer requests and quotes (modules A, B)

Built in Step 3 (D-024): requests with private sites, matching by category
and town, invitations from the contractor directory, private quotes with
revise and withdraw, award, cancel, complete, staff oversight. Still to do:
reviews, public contractor profiles, request messaging.

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
- Reminders before a contractor's insurance lapses (new staffing is already blocked, D-017).
- Engagement type wording reviewed by employment counsel before launch (D-016).
- Update the market pay floor each January (D-016).
- Schedule `pnpm storage:reconcile`.
- Password reset and email change.
- Document expiry reminders (needs a scheduler and email provider).
- Staff roles finer than "admin" (reviewer, support, finance).
