import { FormMessage } from "@/components/ui/form";
import { formatDateTime, type ReviewStatus } from "@/lib/labels";

/** Explains where a registration stands, in the owner's terms. */
export function StatusBanner({
  status,
  notes,
  submittedAt,
  subject,
  rereviewReason = null,
}: {
  status: ReviewStatus;
  notes: string | null;
  submittedAt: Date | null;
  subject: string;
  rereviewReason?: string | null;
}) {
  if (status === "pending_review" && rereviewReason) {
    return (
      <FormMessage tone="info">
        Your {subject} went back to QuickPro staff for review on {formatDateTime(submittedAt)} because of changes to
        details they had approved ({rereviewReason}). It is not approved again until staff finish that review.
      </FormMessage>
    );
  }
  switch (status) {
    case "draft":
      return <FormMessage tone="info">Complete the checklist below, then submit your {subject} for review.</FormMessage>;
    case "pending_review":
      return (
        <FormMessage tone="info">
          Submitted {formatDateTime(submittedAt)}. QuickPro staff are reviewing your {subject}. You can keep updating
          contact details and documents in the meantime.
        </FormMessage>
      );
    case "rejected":
      return (
        <FormMessage tone="bad">
          QuickPro staff asked for changes{notes ? `: ${notes}` : "."} Update your {subject} and submit it again.
        </FormMessage>
      );
    case "approved":
      // Quiet once approved: the badge in the header already says so.
      return (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ok" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Your {subject} is approved by QuickPro staff.
        </p>
      );
    case "suspended":
      return (
        <FormMessage tone="bad">
          Your {subject} is suspended{notes ? `: ${notes}` : "."} Contact QuickPro support to resolve it.
        </FormMessage>
      );
  }
}
