import "server-only";
import { z } from "zod";

/** An optional variable; an empty value (as copied from .env.example) counts as unset. */
const optional = <T extends z.ZodType>(type: T) => z.preprocess((v) => (v === "" ? undefined : v), type.optional());

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  DATABASE_URL: z.string().startsWith("postgres"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  NEXT_PUBLIC_SITE_URL: z.url(),
  FILE_STORAGE_DRIVER: z.enum(["supabase", "local"]).default("supabase"),
  LOCAL_STORAGE_DIR: z.string().default(".data/uploads"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Notification email (D-039). none: queue only; log: write files under
  // EMAIL_LOG_DIR (development); smtp: send through SMTP_URL.
  EMAIL_DRIVER: z.enum(["none", "log", "smtp"]).default("none"),
  SMTP_URL: optional(z.string().regex(/^smtps?:\/\//, "Use smtp:// or smtps://")),
  EMAIL_FROM: z.string().min(3).default("QuickPro <notifications@quickpro.example>"),
  EMAIL_LOG_DIR: z.string().default(".data/outbox"),
  // Lets a scheduler call /api/cron/deliver-emails. At least 32 characters.
  CRON_SECRET: optional(z.string().min(32)),
  // Card payments through Stripe Connect (D-040). Test-mode keys only: a
  // live key is refused until card payments are approved for launch.
  STRIPE_SECRET_KEY: optional(
    z
      .string()
      .refine((v) => !v.startsWith("sk_live_") && !v.startsWith("rk_live_"), "Live Stripe keys aren't allowed yet (D-040).")
      .refine((v) => /^(sk|rk)_test_[A-Za-z0-9_]{10,}$/.test(v), "Use a Stripe test-mode secret key (sk_test_...)."),
  ),
  STRIPE_WEBHOOK_SECRET: optional(z.string().regex(/^whsec_[A-Za-z0-9_]{10,}$/, "Use the endpoint's signing secret (whsec_...).")),
  STRIPE_CONNECT_WEBHOOK_SECRET: optional(z.string().regex(/^whsec_[A-Za-z0-9_]{10,}$/)),
  // Tests only: send Stripe API calls to the local stand-in (e2e/stripe-stand-in.mjs).
  STRIPE_API_BASE: optional(z.string().regex(/^http:\/\/(127\.0\.0\.1|localhost):[0-9]{2,5}$/, "Only a local test address.")),
  // A demonstration environment (D-043): every page carries a "Demo
  // environment" banner, and `pnpm demo:seed` may add labeled example records.
  DEMO_MODE: z.enum(["on", "off"]).default("off"),
});

export type Env = z.infer<typeof schema>;

/**
 * Whether this is a demonstration environment. Read on its own (not through
 * env()) because the root layout renders static pages at build time, where
 * the rest of the server environment isn't needed.
 */
export function demoMode(): boolean {
  return process.env.DEMO_MODE === "on";
}

let cached: Env | undefined;

/** Validated server environment. Read lazily so `next build` does not need secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment. Check .env.local against .env.example:\n${issues}`);
  }
  const value = parsed.data;
  if (value.FILE_STORAGE_DRIVER === "local" && value.NODE_ENV === "production") {
    throw new Error("FILE_STORAGE_DRIVER=local is for development only. Use supabase in production.");
  }
  if (value.FILE_STORAGE_DRIVER === "supabase" && !value.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required when FILE_STORAGE_DRIVER=supabase.");
  }
  if (value.EMAIL_DRIVER === "log" && value.NODE_ENV === "production") {
    throw new Error("EMAIL_DRIVER=log is for development only. Use smtp (or none) in production.");
  }
  if (value.EMAIL_DRIVER === "smtp" && !value.SMTP_URL) {
    throw new Error("SMTP_URL is required when EMAIL_DRIVER=smtp.");
  }
  if (value.STRIPE_SECRET_KEY && !value.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required with STRIPE_SECRET_KEY, or payments would never be confirmed.");
  }
  cached = value;
  return value;
}
