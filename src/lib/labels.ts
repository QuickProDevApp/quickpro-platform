export type ReviewStatus = "draft" | "pending_review" | "approved" | "rejected" | "suspended";
export type DocumentStatus = "pending" | "approved" | "rejected";
export type DocumentType =
  | "general_liability_coi"
  | "workers_comp_coi"
  | "auto_liability_coi"
  | "business_license"
  | "certification"
  | "other";
export type OrganizationKind = "contractor" | "customer";

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Draft",
  pending_review: "In review",
  approved: "Approved",
  rejected: "Changes requested",
  suspended: "Suspended",
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: "Awaiting staff review",
  approved: "Reviewed by QuickPro staff",
  rejected: "Not accepted",
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  general_liability_coi: "General liability certificate of insurance",
  workers_comp_coi: "Workers' compensation certificate",
  auto_liability_coi: "Commercial auto certificate",
  business_license: "Business license or registration",
  certification: "Training or certification",
  other: "Other",
};

export const ORG_DOCUMENT_TYPES: DocumentType[] = [
  "general_liability_coi",
  "workers_comp_coi",
  "auto_liability_coi",
  "business_license",
  "certification",
  "other",
];

export const WORKER_DOCUMENT_TYPES: DocumentType[] = ["certification", "other"];

export const ORGANIZATION_KIND_LABEL: Record<OrganizationKind, string> = {
  contractor: "Contractor",
  customer: "Customer",
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** "18:00:00" -> "6:00 PM" */
export function formatTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  // Plain dates ("2027-06-30") are calendar dates, not instants.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d));
  }
  return dateFormat.format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateTimeFormat.format(new Date(value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Insurance certificates need an expiration date before staff can mark them reviewed. */
export const INSURANCE_DOCUMENT_TYPES: DocumentType[] = ["general_liability_coi", "workers_comp_coi", "auto_liability_coi"];

/** Mirrors public.organization_insurance_status. */
export type InsuranceStatus = "current" | "pending_review" | "expired" | "rejected" | "missing";

export const INSURANCE_STATUS_LABEL: Record<InsuranceStatus, string> = {
  current: "Reviewed by staff, not expired",
  pending_review: "Waiting for staff review",
  expired: "Expired",
  rejected: "Not accepted",
  missing: "Not uploaded",
};

export type JobStatus = "open" | "filled" | "completed" | "cancelled";
export type ApplicationStatus = "applied" | "offered" | "declined" | "withdrawn";
export type AssignmentStatus = "offered" | "accepted" | "declined" | "cancelled" | "completed";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  open: "Open",
  filled: "Filled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "Applied",
  offered: "Offered",
  declined: "Not selected",
  withdrawn: "Withdrawn",
};

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  offered: "Offer waiting for an answer",
  accepted: "Accepted",
  declined: "Offer declined",
  cancelled: "Cancelled",
  completed: "Completed",
};

/** Where an open or filled job is in time. Completed and cancelled jobs use their status. */
export function jobPhase(job: { status: JobStatus; starts_at: Date; ends_at: Date }, now = new Date()) {
  if (job.status === "completed" || job.status === "cancelled") return JOB_STATUS_LABEL[job.status];
  if (now < job.starts_at) return JOB_STATUS_LABEL[job.status];
  if (now < job.ends_at) return "In progress";
  return "Finished, not marked complete";
}

const timeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/New_York" });
const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});

/** "Sat, Nov 7 · 7:00 AM – 3:00 PM" in the market's time zone. */
export function formatShift(startsAt: Date, endsAt: Date): string {
  const sameDay = dayFormat.format(startsAt) === dayFormat.format(endsAt);
  return sameDay
    ? `${dayFormat.format(startsAt)} · ${timeFormat.format(startsAt)} – ${timeFormat.format(endsAt)}`
    : `${dayFormat.format(startsAt)} ${timeFormat.format(startsAt)} – ${dayFormat.format(endsAt)} ${timeFormat.format(endsAt)}`;
}

export function shiftHours(startsAt: Date, endsAt: Date): number {
  return Math.round(((endsAt.getTime() - startsAt.getTime()) / 3_600_000) * 100) / 100;
}

export type OrgRole = "owner" | "admin" | "dispatcher" | "member";

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  dispatcher: "Dispatcher",
  member: "Member",
};

export const ORG_ROLE_DESCRIPTION: Record<OrgRole, string> = {
  owner: "Everything, including owners and admins.",
  admin: "Business profile, documents, team (except owners and admins) and jobs.",
  dispatcher: "Post and staff jobs, see bookings.",
  member: "Can see the business and its jobs.",
};
