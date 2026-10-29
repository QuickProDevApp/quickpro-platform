# Deploying a preview

QuickPro has not been deployed anywhere yet. This is the exact setup for a
private preview on Vercel and a hosted Supabase project, so the contractor,
worker and staff journeys can be tested in a browser. Use a separate Supabase
project for the preview, never one holding real customer data.

## 1. Supabase project

1. Create a project at https://supabase.com/dashboard (region: East US).
   Save the database password.
2. Apply the migrations from this repository:

   ```bash
   pnpm supabase login
   pnpm supabase link --project-ref <project-ref>
   pnpm supabase db push          # applies supabase/migrations, including the storage bucket
   ```

3. **Storage:** check that the bucket `qualification-documents` exists and is
   **private** (Dashboard → Storage). The migration creates it with a 10 MB
   limit and PDF/JPEG/PNG only. Add no storage policies.
4. **Auth → URL configuration:** Site URL = the preview URL (for example
   `https://quickpro-preview.vercel.app`). Redirect URLs: add
   `https://<preview-host>/auth/confirm`.
5. **Auth → Providers → Email:** keep "Confirm email" on, minimum password
   length 10.
6. **Email delivery:** Supabase's built-in email only sends to members of the
   Supabase organization and is rate limited. Either invite the testers to the
   Supabase organization, or set up custom SMTP (Auth → SMTP, for example
   Resend or Postmark with a test domain).
7. **Keys** (Project Settings → API keys): the publishable (or anon) key, and
   a secret (or service_role) key. **Database URL** (Connect → Transaction
   pooler, port 6543).

## 2. Vercel project

1. Import `docfico/quickpro-platform` at https://vercel.com/new. Framework:
   Next.js. Install command: `pnpm install`.
2. Environment variables (Preview environment):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable or anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret or service_role key (mark Sensitive) |
   | `DATABASE_URL` | transaction pooler URL, with `?sslmode=require` (mark Sensitive) |
   | `DATABASE_POOL_MAX` | `1` |
   | `NEXT_PUBLIC_SITE_URL` | the preview URL |
   | `FILE_STORAGE_DRIVER` | `supabase` |

3. Deploy the `phase-1-foundation` branch. Turn on Deployment Protection
   (Settings → Deployment Protection) so only invited people can open it.
4. **Upload size on Vercel:** Vercel functions accept request bodies up to
   4.5 MB, so uploads between 4.5 MB and 10 MB fail on Vercel even though the
   app allows them. Test with smaller files. The fix (direct-to-storage signed
   uploads, validated after upload) is a follow-up.

## 3. Staff account

Sign up through the preview, confirm the email, then from a machine with this
repository:

```bash
DATABASE_URL='<session or direct connection URL>' pnpm admin:grant you@example.com
```

## 4. Journeys to test

**Contractor** (phone-sized window works best)
1. Sign up as a contractor, confirm the email, register a business.
2. Press "Submit for review" early: the missing items are listed.
3. Fill in the profile (legal name, phone, email), pick a category and a town,
   upload a general liability certificate (PDF under 4.5 MB) with an
   expiration date, and submit.
4. After staff approval: the page says approved, and the insurance card says
   "Reviewed by staff, not expired". Change the business name: the
   registration goes back to review, with the reason shown.

**Worker**
1. Sign up as a worker, create the profile, pick skills and towns, add an
   availability window, add your phone on the account page, submit.
2. After staff approval, add a skill or change your name: the profile goes
   back to review.

**Staff**
1. Open Staff. The overview counts are live from the database.
2. Open the contractor. Press Approve first: it is refused until the
   certificate is reviewed. Mark the certificate reviewed (expiration date
   required), then approve. Try "Request changes" without a note: refused.
3. Approve the worker. Suspend and reinstate a business (note required).
4. Open the audit log and filter by the business.
5. From another account, try opening the business's URL: you get "not found".

## 5. Housekeeping

- Run `pnpm storage:reconcile --dry-run` (with the preview's
  `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`)
  to see stray files; without `--dry-run` it removes them.
- Delete the preview Supabase project when testing ends.
