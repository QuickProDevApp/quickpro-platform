import "server-only";
import { z } from "zod";

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
});

export type Env = z.infer<typeof schema>;

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
  cached = value;
  return value;
}
