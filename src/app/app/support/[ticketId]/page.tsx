import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SUPPORT_TOPIC_LABEL, SupportReplyForm, SupportStatusBadge, SupportThread } from "@/components/app/support";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { replyToSupportTicketAction, resolveMySupportTicketAction } from "@/server/actions/support";
import { requireUser } from "@/server/auth/session";
import { getSupportTicket, listSupportMessages } from "@/server/data/support";

export const metadata: Metadata = { title: "Support request" };

const REOPEN_DAYS = 30;

export default async function SupportTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { ticketId } = await params;
  if (!uuid.safeParse(ticketId).success) notFound();
  const user = await requireUser();
  const ticket = await getSupportTicket(user.id, ticketId);
  // Staff open requests from the staff queue; this page is the person's own view.
  if (!ticket || ticket.requester_id !== user.id) notFound();
  const messages = await listSupportMessages(user.id, ticket.id);
  const sent = (await searchParams).sent === "1";
  const reopenUntil = ticket.resolved_at ? new Date(ticket.resolved_at.getTime() + REOPEN_DAYS * 86_400_000) : null;
  const canReply = ticket.status !== "resolved" || (reopenUntil !== null && reopenUntil > new Date());

  return (
    <>
      <PageHeader
        back={{ href: "/app/support", label: "Help and support" }}
        title={ticket.subject}
        meta={<SupportStatusBadge status={ticket.status} viewer="requester" />}
        description={`Request #${ticket.ref} · ${SUPPORT_TOPIC_LABEL[ticket.topic]}${ticket.organization_name ? ` · ${ticket.organization_name}` : ""} · opened ${formatDateTime(ticket.created_at)}`}
      />
      <div className="max-w-3xl space-y-4">
        {sent ? <FormMessage tone="ok">Request sent. QuickPro staff will reply here, and you&apos;ll get a notification.</FormMessage> : null}
        {ticket.status === "waiting" ? (
          <FormMessage tone="info">QuickPro support replied and is waiting on you. Reply below, or mark it resolved if you&apos;re all set.</FormMessage>
        ) : null}
        <Card>
          <CardHeader title="Conversation" description="Only you and QuickPro staff see this." />
          <CardBody className="space-y-5">
            <SupportThread messages={messages} viewer="requester" />
            {canReply ? (
              <SupportReplyForm action={replyToSupportTicketAction.bind(null, ticket.id)} reopens={ticket.status === "resolved"} />
            ) : (
              <p className="rounded-md bg-subtle/70 px-3 py-2.5 text-sm text-muted">
                This request was resolved more than {REOPEN_DAYS} days ago. Open a new request if you still need help.
              </p>
            )}
          </CardBody>
        </Card>
        {ticket.status !== "resolved" ? (
          <ActionForm action={resolveMySupportTicketAction.bind(null, ticket.id)} className="flex flex-wrap items-center gap-3" successMessage={false}>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Mark as resolved
            </SubmitButton>
            <span className="text-[13px] text-muted">Sorted out? This tells staff they can stop working on it.</span>
          </ActionForm>
        ) : (
          <p className="text-[13px] text-muted">
            Resolved {formatDateTime(ticket.resolved_at)}.{canReply ? ` Reply within ${REOPEN_DAYS} days to reopen it.` : ""}
          </p>
        )}
      </div>
    </>
  );
}
