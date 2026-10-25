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
