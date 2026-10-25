# QuickPro product spec

QuickPro is a hyperlocal B2B service marketplace and workforce coordination
platform. It helps small local service companies accept and fulfill commercial
work they could not otherwise staff or coordinate, by connecting them with
commercial job opportunities, flexible local labor, and the software to run
the job.

It is not a job board. The measure of success is work that gets fulfilled by
small contractors, not listings posted.

## Launch market and scope

- **Market:** Suffolk County, NY (10 towns). Nassau County is modeled but
  closed. Markets and service areas are data, so new regions do not need code.
- **Categories:** commercial cleaning, pressure washing, landscaping, facility
  services. Categories and skills are data.
- **Go-to-market:** contractor-first. Start with contractors who already have
  work and lack people or coordination. QuickPro staff do concierge matching
  through the admin dashboard until the marketplace has real liquidity.
  Customer-driven discovery comes after that.

## Users

| Role | Who | Core jobs |
| --- | --- | --- |
| Customer | Property managers, owners, facilities, venues, businesses | Submit jobs, compare qualified contractors and quotes, book, communicate, review outcomes |
| Contractor | Registered service businesses (an organization with members) | Business profile, services and areas, browse opportunities, quote, accept jobs, request extra workers, manage crews, schedule, track |
| Worker | Individuals | Skill profile, availability, preferred areas and travel, desired pay, apply to shifts, accept assignments, see history |
| Admin | QuickPro staff | Approve registrations, review qualifications, oversee requests, manual matching, disputes, moderation, metrics |

A person signs in once and can hold several roles: owner of a contractor
business, a worker profile, and membership in a customer organization.
Contractors and customers are organizations; workers are individuals.

## Modules

| | Module | Phase |
| --- | --- | --- |
| A | Commercial service request marketplace | 4 |
| B | Contractor discovery and quotation | 4 |
| C | Local staffing and worker matching | 2 |
| D | Scheduling and crew coordination | 2–3 |
| E | Job management, messaging, proof of completion | 3 |
| F | Payments and invoicing (when legally and operationally configured) | 5 |
| G | Admin operations, moderation, analytics, support | 1 onward |

See [roadmap.md](roadmap.md) for sequencing.

## Principles

1. **Honest status.** The product never says "verified", "insured",
   "background checked" or "paid" unless that thing actually happened through
   a real integration. A staff document review is labeled as a staff review.
2. **No dead ends.** No buttons that do nothing, no sample data dressed up as
   live data, no simulated success. Features that are not built are not shown,
   or are shown as clearly labeled future work.
3. **Classification-neutral staffing.** QuickPro does not assume workers are
   independent contractors. Each engagement will record who engages the worker
   and on what basis (employee of the contractor, subcontractor, staffing
   agency arrangement), configured after legal review. QuickPro does not build
   anything that sidesteps employment eligibility (I-9/E-Verify) obligations,
   which stay with the employer.
4. **Operations first.** Dashboards lead with what needs action, who is
   available, and what is at risk, not vanity numbers.
5. **Mobile first.** Contractors and workers run their day from a phone.

## Phase 1: foundation (this phase)

Goal: real accounts, real organizations, and a real staff review workflow, so
QuickPro can start onboarding Suffolk contractors and workers and do concierge
matching by hand.

### Acceptance criteria

**Accounts**
- [x] A visitor can sign up with name, email and password. Email confirmation is required by Supabase Auth before sign-in.
- [x] A user can sign in, sign out, and is redirected to sign-in when visiting any `/app` page without a session.
- [x] A profile row is created automatically for every new account. Users can edit their name and phone. No user can make themselves staff; staff access is granted from the command line by someone with database access.

**Onboarding**
- [x] After sign-in, a user without a role sees a chooser: register a contractor business, create a worker profile, or register a customer organization.
- [x] Registering an organization requires a name and an open market; the user becomes its owner.

**Contractor**
- [x] An owner can edit the business profile (legal name, contact details, address, years in business, crew size, description).
- [x] An owner can choose service categories and Suffolk service areas.
- [x] An owner can upload qualification documents (PDF, JPEG or PNG, up to 10 MB) with a type and optional expiry date, see their review status, download them, and delete ones that are not approved.
- [x] The dashboard shows a readiness checklist and can submit for review only when the database's requirements are met: phone, email, legal name, at least one category, one area, and an unexpired general liability certificate. Missing items are listed.
- [x] After submission, name, legal name and market are locked; contact details stay editable. Status and staff notes are visible.

**Worker**
- [x] A user can create a worker profile: headline, bio, home area, preferred areas, travel radius, vehicle and license, years of experience, desired hourly rate, skills, weekly availability.
- [x] A worker can upload certifications and submit the profile for review once it has a name, phone, headline, home area, a skill and an availability window.

**Customer**
- [x] A customer organization can be registered, completed (contact details and address) and submitted for review. Job requests are not part of Phase 1, and the dashboard says so.

**Admin**
- [x] The admin overview shows live counts from the database: pending organizations, pending workers, documents awaiting review, and documents expiring within 30 days.
- [x] Staff can open any organization or worker, see their details and documents, approve or reject (note required to reject), suspend and reinstate (note required to suspend).
- [x] Staff can approve or reject each document and set its expiry date.
- [x] Staff can browse the audit log, filtered by entity.

**Security**
- [x] Every table has row level security; writes are limited by column grants; status changes only happen in database workflow functions.
- [x] Every create, update and delete of business data is recorded in an append-only audit log with the acting user.
- [x] Uploaded files are checked by size and file signature (not just the extension), stored privately under generated names, and downloaded only through an authorized route.
- [x] No secrets in the repository. `.env.example` lists every variable.

**Quality**
- [x] Lint, typecheck, unit tests, database integration tests and production build pass locally and are wired into CI (GitHub Actions).
- [x] An end-to-end test covers sign-up → contractor registration → submission → staff approval against a real Supabase Auth server.

### Out of scope for Phase 1

Inviting team members, shifts and staffing requests, job requests, quotes,
messaging, scheduling, payments, notifications beyond Supabase's auth emails,
public contractor profiles.
