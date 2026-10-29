# Phase 1 status

Written for the PR #1 review (2026-10-25). Four columns, kept separate on
purpose:

- **Built**: the code exists on `phase-1-foundation`.
- **Automated**: an automated test exercises it and passes. "db" means the
  database integration suite (real migrations on Postgres 16, run as the
  `authenticated` role under RLS); "storage" means the suite against a real
  Supabase Storage API; "e2e" means Playwright in Chromium at phone and
  desktop sizes against a running app, a real Supabase Auth (GoTrue) server
  and a real Supabase Storage API.
- **Manually checked**: a person (here, Claude) looked at it working in a
  browser on the local stack. Screenshots from the first round are in the
  project files.
- **Not tested**: nothing has exercised it yet.

## Test runs for this revision

| Suite | Result | Where it ran |
| --- | --- | --- |
| Lint, typecheck | pass | local, CI |
| Unit (`pnpm test`) | 14 passed | local, CI |
| Database integration (`pnpm test:db`) | 61 passed | local, CI (plain Postgres 16 with the shim) |
| Storage integration (`pnpm test:storage`) | 6 passed | local, against Supabase Storage API v1.81.5 + GoTrue built from source; CI (Supabase CLI stack) |
| End to end (`pnpm test:e2e`) | 6 passed (3 specs × mobile, desktop) | local, against GoTrue + Storage API with `FILE_STORAGE_DRIVER=supabase`; CI against the Supabase CLI stack |
| Production build | pass | local, CI |

The local stack is not the Supabase CLI's Docker stack (Docker is not
available where this was built). It is the same Auth and Storage servers
Supabase runs, built from their published source, behind a small gateway on
port 54321. Differences from a hosted project: plain Postgres 16 instead of
Supabase's Postgres image, an SMTP sink instead of a mail provider, and no
Kong/PostgREST (the app does not use PostgREST).

## Breakdown

| Area | Built | Automated | Manually checked | Not tested / gaps |
| --- | --- | --- | --- | --- |
| Sign up, email confirmation, sign in, sign out | yes | e2e (confirmation through the auth admin API) | yes | Clicking a real confirmation email from a real provider. **Password reset is not built.** |
| Redirects for signed-out visitors, 404 for other people's pages | yes | e2e, db | yes | |
| Profiles, staff granted only by script | yes | db | yes | `pnpm admin:grant` against a hosted project |
| Contractor registration, profile, services, areas | yes | e2e, db | yes | |
| Contractor market boundary (areas must be in the org's market) | yes (DB triggers) | db | | |
| Submission readiness rules | yes | e2e, db | yes | |
| Insurance gate on contractor approval and reinstatement | yes | db (unreviewed, rejected, missing, expired, wrong type, reinstate when lapsed), e2e (approve refused, then allowed) | via e2e only | |
| Insurance certificates need an expiry to be marked reviewed | yes | db | | Admin UI path for the error message is not e2e-tested |
| Insurance status on contractor and staff pages, "approved contractors without current insurance" queue | yes | db (status function) | | Pages not e2e-tested |
| Re-review on material changes (name/legal name, new category, new skill, worker name) | yes | db (each trigger, staff edits exempt, drafts exempt, locks while in review/suspended), e2e (rename sends back to review) | via e2e only | Worker re-review is not e2e-tested |
| Worker profile, skills, areas, availability, submission | yes | e2e, db | yes | |
| Worker profile + skills + areas saved atomically | yes | db (rollback on bad skill, on out-of-market town) | | |
| Customer organization registration and submission | yes | db | yes | Not e2e-tested |
| Document upload: validation by file signature, private storage | yes | unit, db, storage, e2e | yes | |
| Upload consistency (row + object) and cleanup on failure | yes | db with a failing storage double (write fails, commit fails, cleanup fails), storage | | A real network failure mid-upload against Supabase |
| Document download through the authorized route | yes | e2e (real Storage), storage (no direct client access) | yes | |
| Document delete (row first, then object; orphan left for reconciliation) | yes | db (incl. failed object delete), storage | | Delete button not e2e-tested |
| Storage reconciliation (`pnpm storage:reconcile`) | yes | db, storage | | **Not scheduled**: someone has to run it (see below) |
| Staff review of organizations, workers, documents | yes | e2e (contractor approve, document review), db | yes | Suspend/reinstate and worker approval through the UI are not e2e-tested |
| Role boundaries (dispatcher/member read only, org admin can manage) | yes (DB) | db (members inserted directly) | | No invite UI yet (Phase 2) |
| Cross-user and cross-org isolation | yes | db, e2e | | |
| Signed-out callers cannot run workflow functions | yes | db | | |
| Audit log | yes | db, e2e (one entry) | yes | |
| Security headers | yes | | partly (curl) | No CSP for app pages yet |
| CI | yes | lint, typecheck, unit, db, build; integration job runs storage and e2e on the Supabase CLI stack (green on c0e5a3d) | | |
| Deployment (Vercel + hosted Supabase) | docs only | | | **Never deployed** |

## Known gaps carried into the PR

- **Insurance expiry after approval** does not change the contractor's status
  automatically. The certificate shows as expired, the contractor's page says
  so, and staff see the business in "Approved contractors without current
  reviewed insurance". Reinstating a suspended contractor requires current
  insurance. Automatic action (suspend, or block new work) belongs with Phase
  2 shift assignment and needs a scheduler.
- **Reconciliation is manual.** `pnpm storage:reconcile` (or `--dry-run`)
  must be run by an operator or a scheduled job; there is no scheduler yet.
  Orphans are rare (they need both a failed transaction and a failed
  cleanup) and are private.
- **No password reset or email change flow.**
- **Uploads over 4.5 MB fail on Vercel** (its function body limit), though the
  app accepts up to 10 MB. Fix: signed direct-to-storage uploads validated
  after upload. See deployment.md.
- **No team invitations**; roles other than owner are tested by inserting
  members directly.
