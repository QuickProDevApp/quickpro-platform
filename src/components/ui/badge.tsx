import {
  APPLICATION_STATUS_LABEL,
  ASSIGNMENT_STATUS_LABEL,
  DOCUMENT_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
  jobPhase,
  type ApplicationStatus,
  type AssignmentStatus,
  type DocumentStatus,
  type JobStatus,
  type ReviewStatus,
} from "@/lib/labels";

type Tone = "neutral" | "info" | "ok" | "warn" | "bad";

const tones: Record<Tone, string> = {
  neutral: "bg-subtle text-ink-soft ring-line-strong/60",
  info: "bg-info-soft text-info ring-info/20",
  ok: "bg-ok-soft text-ok ring-ok/20",
  warn: "bg-warn-soft text-warn ring-warn/25",
  bad: "bg-bad-soft text-bad ring-bad/20",
};

const dots: Record<Tone, string> = {
  neutral: "bg-faint",
  info: "bg-info",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

/** A compact status label. Status badges carry a dot; counts and tags do not. */
export function Badge({ tone = "neutral", dot = false, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${tones[tone]}`}
    >
      {dot ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} /> : null}
      {children}
    </span>
  );
}

const reviewTone: Record<ReviewStatus, Tone> = {
  draft: "neutral",
  pending_review: "info",
  approved: "ok",
  rejected: "warn",
  suspended: "bad",
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge dot tone={reviewTone[status]}>{REVIEW_STATUS_LABEL[status]}</Badge>;
}

const documentTone: Record<DocumentStatus, Tone> = { pending: "info", approved: "ok", rejected: "bad" };

export function DocumentStatusBadge({ status, expiresOn }: { status: DocumentStatus; expiresOn?: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  if (expiresOn && expiresOn < today) return <Badge dot tone="bad">Expired</Badge>;
  return <Badge dot tone={documentTone[status]}>{DOCUMENT_STATUS_LABEL[status]}</Badge>;
}

const jobTone: Record<JobStatus, Tone> = { open: "info", filled: "ok", completed: "neutral", cancelled: "bad" };

export function JobStatusBadge({ job }: { job: { status: JobStatus; starts_at: Date; ends_at: Date } }) {
  const label = jobPhase(job);
  const tone = label === "In progress" ? "warn" : jobTone[job.status];
  return <Badge dot tone={tone}>{label}</Badge>;
}

const assignmentTone: Record<AssignmentStatus, Tone> = {
  offered: "info",
  accepted: "ok",
  declined: "neutral",
  cancelled: "bad",
  completed: "neutral",
};

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return <Badge dot tone={assignmentTone[status]}>{ASSIGNMENT_STATUS_LABEL[status]}</Badge>;
}

const applicationTone: Record<ApplicationStatus, Tone> = {
  applied: "info",
  offered: "ok",
  declined: "neutral",
  withdrawn: "neutral",
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge dot tone={applicationTone[status]}>{APPLICATION_STATUS_LABEL[status]}</Badge>;
}
