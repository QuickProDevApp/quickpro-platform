# Phase 2 status

Written for the Phase 2 PR (2026-10-29). Same columns as phase-1-status.md:
**Built** (the code exists), **Automated** (a test exercises it and passes),
**Not tested / gaps**. Nothing in this phase has been manually checked in a
browser yet: the environment it was built in has no Supabase Auth server, so
the screens have been checked only by the build and, in CI, by Playwright.

The migration `20261029000100_jobs_and_assignments.sql` has **not** been
applied to QuickPro Preview or any hosted database.

## Test runs for this revision

| Suite | Result | Where it ran |
| --- | --- | --- |
| Lint, typecheck | pass | local |
| Unit (`pnpm test`) | 15 passed | local |
| Database integration (`pnpm test:db`) | 92 passed (31 new for jobs) | local, plain Postgres 16 with the shim |
| End to end (`pnpm test:e2e`) | 2 new specs × mobile, desktop; not run locally | CI only (Supabase CLI stack) |
| Production build | pass | local |

## Breakdown

| Area | Built | Automated | Not tested / gaps |
| --- | --- | --- | --- |
| Post a job (pay floor, town in market, 120-day window, approved and insured contractor) | yes | db, e2e | |
| Edit a job; fields locked after booking; pay can only go up | yes | db | e2e covers posting only |
| Cancel and complete a job | yes | db | |
| Workers find open jobs in their towns or the whole market | yes | db, e2e | No distance or availability matching |
| Apply, withdraw, re-apply | yes | db; apply in e2e | |
| Offer to applicants, decline applicants, capped at headcount | yes | db, e2e | |
| Accept or decline an offer; overlapping bookings refused | yes | db; accept in e2e | |
| Address and contact shown only after booking; phone shown to the business only after booking | yes | db, e2e | |
| Job fills at headcount, reopens when a booking is cancelled | yes | db; fill in e2e | |
| Check-in (from an hour before start) and check-out | yes | db | Not in e2e (needs a job starting within the hour) |
| Staff jobs queue, unfilled within 48 hours, hand matching | yes | db; queue in e2e | |
| Outsiders get 404 on another business's job and on staff pages | yes | db (RLS), e2e | |
| Audit entries for every job, application and assignment change | yes | db | |
| Notifications (email or SMS) | **no** | | Screens say nothing is sent yet |
| Team invites | **no** | | Roles are enforced; members are added by staff for now |
| Fill-rate and time-to-fill metrics | **no** | | Staff overview shows counts only |

## Needs a person before launch

- Employment counsel reviews the engagement type wording (decisions.md, D-016).
- Confirm the $17.00 pay floor for Suffolk and Nassau (D-016).
