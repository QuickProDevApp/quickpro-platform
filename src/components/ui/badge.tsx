import {
  DOCUMENT_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
  type DocumentStatus,
  type ReviewStatus,
} from "@/lib/labels";

type Tone = "neutral" | "info" | "ok" | "warn" | "bad";

const tones: Record<Tone, string> = {
  neutral: "bg-line/70 text-ink-soft",
  info: "bg-info-soft text-info",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
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
  return <Badge tone={reviewTone[status]}>{REVIEW_STATUS_LABEL[status]}</Badge>;
}

const documentTone: Record<DocumentStatus, Tone> = { pending: "info", approved: "ok", rejected: "bad" };

export function DocumentStatusBadge({ status, expiresOn }: { status: DocumentStatus; expiresOn?: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  if (expiresOn && expiresOn < today) return <Badge tone="bad">Expired</Badge>;
  return <Badge tone={documentTone[status]}>{DOCUMENT_STATUS_LABEL[status]}</Badge>;
}
