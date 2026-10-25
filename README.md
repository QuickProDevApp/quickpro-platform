# QuickPro

QuickPro helps local commercial service companies on Long Island (cleaning,
pressure washing, landscaping, facility services) staff and coordinate the work
they win. It launches in Suffolk County, NY.

This repository holds the web platform. Phase 1 is the foundation: accounts,
contractor and customer registration, worker profiles, qualification documents,
and the staff review dashboard. See [docs/product-spec.md](docs/product-spec.md)
and [docs/roadmap.md](docs/roadmap.md).

## Run it locally

Requirements: Node 22+, pnpm 10, Docker (for local Supabase).

```bash
pnpm install
pnpm supabase start            # Postgres, Auth, Storage, email inbox; applies migrations
pnpm supabase status           # copy API URL, publishable/anon key, service role key, DB URL
cp .env.example .env.local     # paste those values in
pnpm dev                       # http://localhost:3000
```

1. Sign up at http://localhost:3000/sign-up. Open the confirmation email in
   the local inbox at http://127.0.0.1:54324 and click the link.
2. Register a contractor business, fill in the profile, choose services and
   towns, upload a PDF as the general liability certificate, and submit.
3. Make a second account your staff account:
   `pnpm admin:grant staff@example.com`, then sign in as that account and open
   **Staff** to review the document and approve the business.

## Checks

```bash
pnpm check                     # lint, typecheck, unit tests
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/quickpro_test \
  pnpm db:test:reset && pnpm test:db   # needs any local Postgres
pnpm build
set -a; . ./.env.local; set +a; pnpm test:e2e   # with `pnpm dev` and Supabase running
```

Architecture, security model and testing details:
[docs/architecture.md](docs/architecture.md). Decision log:
[docs/decisions.md](docs/decisions.md).
