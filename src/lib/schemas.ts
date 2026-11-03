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

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a date.");

/** Whole or decimal dollars up to $1,000,000; blank is "not set" when optional. */
const amount = (message: string, optional: boolean) =>
  z
    .string()
    .trim()
    .default("")
    .transform((v, ctx) => {
      const cleaned = v.replace(/[$,\s]/g, "");
      if (cleaned === "") {
        if (optional) return null;
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      const n = Number(cleaned);
      if (!Number.isFinite(n) || n < 1 || n > 1_000_000) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return Math.round(n * 100);
    });

export const serviceRequestSchema = z
  .object({
    title: z.string().trim().min(3, "Give the request a short title.").max(120),
    description: z
      .string()
      .trim()
      .min(10, "Describe the work in a sentence or two: what, how big, how often.")
      .max(4000),
    requirements: z.string().trim().max(2000, "Keep requirements under 2,000 characters.").default(""),
    categoryId: uuid,
    serviceAreaId: uuid,
    preferredStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
    preferredEnd: optionalDate,
    budgetMin: amount("Enter a dollar amount, e.g. 2,500.", true),
    budgetMax: amount("Enter a dollar amount, e.g. 4,000.", true),
    addressLine1: z.string().trim().min(3, "Enter the street address.").max(200),
    city: z.string().trim().min(2, "Enter the city or hamlet.").max(80),
    postalCode: z
      .string()
      .trim()
      .regex(/^[0-9]{5}(-[0-9]{4})?$/, "Enter a 5-digit ZIP code."),
    accessNotes: z.string().trim().max(1000).default(""),
    contactName: z.string().trim().min(2, "Who should the contractor contact?").max(120),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ().-]{7,20}$/, "Enter a valid phone number."),
  })
  .refine((v) => v.preferredEnd === null || v.preferredEnd >= v.preferredStart, {
    path: ["preferredEnd"],
    message: "The end date must be on or after the start date.",
  })
  .refine((v) => v.budgetMin === null || v.budgetMax === null || v.budgetMax >= v.budgetMin, {
    path: ["budgetMax"],
    message: "The top of the range must be at least the bottom.",
  });

export type ServiceRequestInput = z.infer<typeof serviceRequestSchema>;

export const quoteSchema = z.object({
  amount: amount("Enter the total price in dollars, e.g. 3,200.", false).pipe(z.number()),
  scope: z.string().trim().min(10, "Describe what the price includes in a sentence or two.").max(4000),
  estimatedStart: optionalDate,
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the last day this price is good for."),
});

export type QuoteInput = z.infer<typeof quoteSchema>;

export const completionNoteSchema = z.object({
  note: z.string().trim().max(1000, "Keep the note under 1,000 characters.").default(""),
});

export const subcontractOfferSchema = z.object({
  subId: uuid,
  scope: z
    .string()
    .trim()
    .min(10, "Describe the part of the work you're handing over in a sentence or two.")
    .max(2000, "Keep the scope under 2,000 characters."),
  /** Optional: the price the two businesses agreed, in cents. */
  amount: amount("Enter the agreed price in dollars, e.g. 850, or leave it blank.", true),
});

export type SubcontractOfferInput = z.infer<typeof subcontractOfferSchema>;

export const subcontractResponseSchema = z.object({
  decision: z.enum(["accept", "decline"], "Choose accept or decline."),
  note: z.string().trim().max(1000, "Keep the note under 1,000 characters.").default(""),
});

export const WORK_CONTEXTS = ["project", "subcontract", "shift"] as const;

export const reviewSchema = z.object({
  rating: z.coerce
    .number("Choose a rating from 1 to 5 stars.")
    .int("Choose a rating from 1 to 5 stars.")
    .min(1, "Choose a rating from 1 to 5 stars.")
    .max(5, "Choose a rating from 1 to 5 stars."),
  body: z.string().trim().max(2000, "Keep the review under 2,000 characters.").default(""),
});

export const reviewReplySchema = z.object({
  reviewId: uuid,
  reply: z.string().trim().min(1, "Write a reply first.").max(1000, "Keep the reply under 1,000 characters."),
});

export const reviewFlagSchema = z.object({
  reviewId: uuid,
  reason: z.string().trim().min(5, "Tell staff what's wrong with this review.").max(500, "Keep the reason under 500 characters."),
});

export const DISPUTE_REASONS = ["quality", "incomplete", "no_show", "hours", "payment", "damage", "conduct", "other"] as const;

export const disputeSchema = z.object({
  reason: z.enum(DISPUTE_REASONS, "Choose what the problem is about."),
  summary: z
    .string()
    .trim()
    .min(20, "Describe what happened in a few sentences (at least 20 characters).")
    .max(2000, "Keep the description under 2,000 characters."),
  desiredOutcome: z.string().trim().max(1000, "Keep this under 1,000 characters.").default(""),
});

export const DISPUTE_OUTCOMES = ["resolved_by_parties", "upheld", "partly_upheld", "not_upheld"] as const;

export const disputeResolutionSchema = z.object({
  outcome: z.enum(DISPUTE_OUTCOMES, "Choose an outcome."),
  resolution: z
    .string()
    .trim()
    .min(10, "Explain the decision to both sides (at least 10 characters).")
    .max(2000, "Keep the resolution under 2,000 characters."),
});

export const moderateReviewSchema = z.object({
  reviewId: uuid,
  decision: z.enum(["hide", "keep"], "Choose hide or keep."),
  reason: z.string().trim().max(500, "Keep the reason under 500 characters.").default(""),
});

// Invoices -----------------------------------------------------------------------

export const PAYMENT_METHODS = ["check", "ach", "wire", "card", "cash", "other"] as const;

const isoDate = (message: string) => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, message);

/** Dollars and cents from a form field, 0 to $1,000,000. */
const lineMoney = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const cleaned = v.replace(/[$,\s]/g, "");
    const n = Number(cleaned);
    if (cleaned === "" || !Number.isFinite(n) || n < 0 || n > 1_000_000 || Math.round(n * 100) !== Number((n * 100).toFixed(4))) {
      ctx.addIssue({ code: "custom", message: "Enter each price in dollars, e.g. 1,250.00." });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

const lineQuantity = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = Number(v.replace(/,/g, ""));
    if (v === "" || !Number.isFinite(n) || n <= 0 || n > 100_000 || Math.round(n * 100) !== Number((n * 100).toFixed(4))) {
      ctx.addIssue({ code: "custom", message: "Quantities must be more than 0, with up to two decimals." });
      return z.NEVER;
    }
    return n;
  });

export const invoiceDraftSchema = z.object({
  dueDate: isoDate("Pick a due date."),
  notes: z.string().trim().max(2000, "Keep the notes under 2,000 characters.").default(""),
  paymentInstructions: z.string().trim().max(1000, "Keep the payment instructions under 1,000 characters.").default(""),
  taxRate: z
    .string()
    .trim()
    .default("")
    .transform((v, ctx) => {
      if (v === "") return 0;
      const n = Number(v.replace(/%$/, ""));
      if (!Number.isFinite(n) || n < 0 || n > 25 || Math.round(n * 1000) !== Number((n * 1000).toFixed(4))) {
        ctx.addIssue({ code: "custom", message: "Enter a rate from 0 to 25 with up to three decimals, e.g. 8.625." });
        return z.NEVER;
      }
      // Thousandths of a percent: 8.625% is 8625.
      return Math.round(n * 1000);
    }),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Describe each line.").max(500, "Keep each line under 500 characters."),
        quantity: lineQuantity,
        unit_cents: lineMoney,
      }),
    )
    .min(1, "Add at least one line.")
    .max(50, "An invoice can have up to 50 lines."),
});

/** Reads the repeated line fields; rows left completely blank are ignored. */
export function invoiceLinesFrom(formData: FormData) {
  const descriptions = formData.getAll("lineDescription").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const units = formData.getAll("lineUnit").map(String);
  return descriptions
    .map((description, i) => ({ description, quantity: quantities[i] ?? "", unit_cents: units[i] ?? "" }))
    .filter((l) => l.description.trim() !== "" || l.quantity.trim() !== "" || l.unit_cents.trim() !== "");
}

export const invoicePaymentSchema = z.object({
  paidOn: isoDate("Enter the date the payment arrived."),
  method: z.enum(PAYMENT_METHODS, "Choose how it was paid."),
  reference: z.string().trim().max(200, "Keep the reference under 200 characters.").default(""),
});

export const invoiceVoidSchema = z.object({
  reason: z.string().trim().max(1000, "Keep the reason under 1,000 characters.").default(""),
});

// Support requests (D-031) -------------------------------------------------

export const SUPPORT_TOPICS = ["account", "verification", "jobs", "projects", "billing", "safety", "technical", "other"] as const;
export const SUPPORT_STATUSES = ["open", "waiting", "resolved"] as const;
export const SUPPORT_PRIORITIES = ["normal", "high", "urgent"] as const;

export const supportTicketSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS, "Choose what it's about."),
  subject: z.string().trim().min(3, "Add a short subject.").max(120, "Keep the subject under 120 characters."),
  body: z
    .string()
    .trim()
    .min(10, "Describe what you need help with (at least 10 characters).")
    .max(4000, "Keep messages under 4,000 characters."),
  // "" means it isn't about one of the person's businesses.
  organizationId: z.union([uuid, z.literal("")]).default(""),
});

export const supportMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message first.").max(4000, "Keep messages under 4,000 characters."),
  internal: z.boolean().default(false),
});

export const supportUpdateSchema = z.object({
  status: z.enum(SUPPORT_STATUSES, "Choose a status."),
  priority: z.enum(SUPPORT_PRIORITIES, "Choose a priority."),
  assignedTo: z.union([uuid, z.literal("")]).default(""),
});

// Public contractor profiles (D-032) ---------------------------------------

export const publicProfileSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Choose a page address of 3 to 60 letters or numbers.")
    .max(60, "Choose a page address of 3 to 60 letters or numbers."),
  intent: z.enum(["publish", "unpublish", "save"], "Choose what to do."),
});

/** Public directory filters: slugs, or nothing. */
export const publicSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60);

// Job checklists (D-034).
export const checklistItemSchema = z.object({
  label: z.string().trim().min(1, "Describe the item.").max(200, "Keep it to 200 characters."),
});

export const checklistDoneSchema = z.object({
  itemId: uuid,
  done: z.enum(["true", "false"]).transform((v) => v === "true"),
  note: z
    .string()
    .trim()
    .max(500, "Keep the note to 500 characters.")
    .optional()
    .transform((v) => v || null),
});

// Job photos (D-035).
export const sharePhotoSchema = z.object({
  photoId: uuid,
  shared: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const jobPhotoSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(200, "Keep the caption to 200 characters.")
    .optional()
    .transform((v) => v || null),
  checklistItemId: z
    .union([uuid, z.literal("")])
    .optional()
    .transform((v) => v || null),
});
