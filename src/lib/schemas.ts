import { z } from "zod";

/** Form fields arrive as strings; blank means "not set". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

const optionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `Enter a whole number from ${min} to ${max}.` });
        return z.NEVER;
      }
      return n;
    })
    .nullable()
    .default(null);

const phone = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null)
  .refine((v) => v === null || /^\+?[0-9 ().-]{7,20}$/.test(v), "Enter a valid phone number.");

export const uuid = z.uuid("Invalid identifier.");

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(10, "Use at least 10 characters.").max(72, "Use at most 72 characters."),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

export const accountSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  phone,
});

export const createOrganizationSchema = z.object({
  kind: z.enum(["contractor", "customer"]),
  name: z.string().trim().min(2, "Enter the business name.").max(120),
  marketId: uuid,
});

export const organizationProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter the business name.").max(120),
  legalName: optionalText(160),
  description: z.string().trim().max(2000).default(""),
  phone,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null)
    .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address."),
  website: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : /^https?:\/\//i.test(v) ? v : `https://${v}`))
    .nullable()
    .default(null)
    .refine((v) => v === null || z.url().safeParse(v).success, "Enter a valid web address."),
  addressLine1: optionalText(200),
  city: optionalText(80),
  postalCode: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null)
    .refine((v) => v === null || /^[0-9]{5}(-[0-9]{4})?$/.test(v), "Enter a 5-digit ZIP code."),
  yearsInBusiness: optionalInt(0, 150),
  crewSize: optionalInt(1, 10000),
});

export const workerProfileSchema = z.object({
  headline: z.string().trim().max(120).default(""),
  bio: z.string().trim().max(2000).default(""),
  homeServiceAreaId: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .pipe(uuid.nullable()),
  maxTravelMiles: z.coerce.number().int("Enter whole miles.").min(0).max(150, "At most 150 miles."),
  hasVehicle: z.boolean(),
  hasDriversLicense: z.boolean(),
  yearsExperience: optionalInt(0, 60),
  desiredHourlyRate: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v.replace(/^\$/, ""));
      if (!Number.isFinite(n) || n < 1 || n > 1000) {
        ctx.addIssue({ code: "custom", message: "Enter an hourly rate in dollars, e.g. 24.50." });
        return z.NEVER;
      }
      return Math.round(n * 100);
    })
    .nullable()
    .default(null),
});

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:00.");

export const availabilitySchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: time,
    endTime: time,
  })
  .refine((v) => v.endTime > v.startTime, { message: "End time must be after start time.", path: ["endTime"] });

export const reviewDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "suspended"]),
    notes: z.string().trim().max(2000).default(""),
  })
  .refine((v) => v.decision === "approved" || v.notes !== "", {
    message: "Add a note explaining the decision.",
    path: ["notes"],
  });

export const documentReviewSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().trim().max(2000).default(""),
    expiresOn: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null)
      .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a date like 2027-06-30."),
  })
  .refine((v) => v.decision === "approved" || v.notes !== "", {
    message: "Add a note explaining why the document was not accepted.",
    path: ["notes"],
  });

export const documentUploadSchema = z.object({
  docType: z.enum([
    "general_liability_coi",
    "workers_comp_coi",
    "auto_liability_coi",
    "business_license",
    "certification",
    "other",
  ]),
  title: z.string().trim().min(1, "Give the document a title.").max(160),
  expiresOn: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a date like 2027-06-30."),
});

export type FieldErrors = Record<string, string[] | undefined>;

export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: FieldErrors;
};

export const initialFormState: FormState = { ok: false };

export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}

/** Reads a FormData into a plain object of strings, with checkbox names mapped to booleans. */
export function formObject(formData: FormData, checkboxes: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  for (const name of checkboxes) out[name] = formData.get(name) === "on";
  return out;
}

const dollars = (message: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = Number(v.replace(/^\$/, ""));
      if (v === "" || !Number.isFinite(n) || n < 1 || n > 1000) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return Math.round(n * 100);
    });

/**
 * A job as entered on the form: a calendar date and wall-clock times in the
 * market's time zone (America/New_York). An end time at or before the start
 * means the shift runs past midnight.
 */
export const jobSchema = z.object({
  title: z.string().trim().min(3, "Give the job a short title.").max(120),
  description: z.string().trim().max(4000).default(""),
  categoryId: uuid,
  serviceAreaId: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  startTime: time,
  endTime: time,
  headcount: z.coerce
    .number({ message: "Enter how many people you need." })
    .int("Enter a whole number.")
    .min(1, "At least 1 person.")
    .max(50, "At most 50 people per job."),
  payRate: dollars("Enter the hourly pay in dollars, e.g. 24.00."),
  engagementTypeId: uuid,
  addressLine1: z.string().trim().min(3, "Enter the street address.").max(200),
  city: z.string().trim().min(2, "Enter the city or hamlet.").max(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}(-[0-9]{4})?$/, "Enter a 5-digit ZIP code."),
  siteNotes: z.string().trim().max(1000).default(""),
  contactName: z.string().trim().min(2, "Who should workers ask for on site?").max(120),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ().-]{7,20}$/, "Enter a valid phone number."),
});

export type JobInput = z.infer<typeof jobSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().min(1, "Add a short reason.").max(1000),
});

export const applicationSchema = z.object({
  note: z.string().trim().max(1000).default(""),
});

const newPassword = z.string().min(10, "Use at least 10 characters.").max(72, "Use at most 72 characters.");

export const emailOnlySchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

export const newPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password."), password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });

export const INVITABLE_ROLES = ["admin", "dispatcher", "member"] as const;

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  role: z.enum(INVITABLE_ROLES, "Choose a role."),
});

export const memberRoleSchema = z.object({
  userId: uuid,
  role: z.enum(["owner", "admin", "dispatcher", "member"], "Choose a role."),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, "Write a message first.").max(2000, "Keep messages under 2,000 characters."),
});

export const hideMessageSchema = z.object({
  messageId: uuid,
  reason: z.string().trim().min(1, "Add a short reason.").max(500),
});
