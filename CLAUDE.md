@AGENTS.md

# QuickPro

Hyperlocal B2B service marketplace and workforce coordination platform,
launching in Suffolk County, NY. Read these first:

- `docs/product-spec.md`: users, modules, principles, Phase 1 acceptance criteria
- `docs/architecture.md`: stack, code layout, authorization model, testing
- `docs/roadmap.md`: phases
- `docs/decisions.md`: decision log (add an entry for any meaningful choice)

## Commands

```bash
pnpm dev                 # app on http://localhost:3000 (needs .env.local)
pnpm lint && pnpm typecheck && pnpm test   # = pnpm check
pnpm db:test:reset && pnpm test:db         # database integration tests (TEST_DATABASE_URL)
pnpm test:e2e            # Playwright against a running app + Supabase
pnpm test:storage        # real Supabase Storage (STORAGE_TEST_* env)
pnpm storage:reconcile   # remove stray storage objects (--dry-run to list)
pnpm build
pnpm supabase start | stop | db reset      # local Supabase (Docker)
pnpm admin:grant you@example.com           # make an account QuickPro staff
```

## Rules

- **All database access goes through `withUser(userId, fn)`** in
  `src/server/db/client.ts`, with the id from `requireUser()`/`requireAdmin()`.
  Never connect as a privileged role from app code; never take a user id from
  the request.
- **Schema changes are new files in `supabase/migrations/`** (never edit an
  applied migration). Every new table: enable RLS, add policies, grant
  columns explicitly, add the audit trigger, and add tests in `tests/db/`.
- **Status and review fields change only through database functions.** Do not
  grant them to `authenticated`.
- **Every server action** re-checks the user, validates input with zod
  (`src/lib/schemas.ts`), and returns `FormState`; map errors with
  `toUserMessage`. Database functions raise `P0001` with user-facing messages.
- **Honest UI:** no buttons that do nothing, no sample data shown as live, no
  "verified"/"insured"/"instant" claims without a real integration. Unbuilt
  features are described as upcoming in text, not rendered as controls.
- **Workers are not assumed to be independent contractors.** Do not add
  classification to worker profiles or anything that bypasses employment
  eligibility; see decisions.md D-009.
- Mobile first: check every screen at phone width.
- No secrets in the repo. Add new variables to `.env.example` and
  `src/server/env.ts`.
- Next.js 16: `proxy.ts` replaces middleware; `params`/`searchParams` are
  promises. Check `node_modules/next/dist/docs/` before using an unfamiliar API.
