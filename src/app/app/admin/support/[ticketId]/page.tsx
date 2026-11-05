import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SUPPORT_TOPIC_LABEL,
  StaffSupportReplyForm,
  SupportPriorityBadge,
  SupportStatusBadge,
  SupportThread,
} from "@/components/app/support";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, Select, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { staffSupportMessageAction, updateSupportTicketAction } from "@/server/actions/support";
import { requireAdmin } from "@/server/auth/session";
import { getSupportTicket, listStaffMembers, listSupportMessages } from "@/server/data/support";

export const metadata: Metadata = { title: "Support request" };

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  if (!uuid.safeParse(ticketId).success) notFound();
  const admin = await requireAdmin();
  const ticket = await getSupportTicket(admin.id, ticketId);
  if (!ticket) notFound();
  const [messages, staff] = await Promise.all([listSupportMessages(admin.id, ticket.id), listStaffMembers(admin.id)]);

  return (
    <>
      <PageHeader
        back={{ href: "/app/admin/support", label: "Support" }}
        title={ticket.subject}
        meta={
          <>
            <SupportStatusBadge status={ticket.status} viewer="staff" />
            <SupportPriorityBadge priority={ticket.priority} />
          </>
        }
        description={`Request #${ticket.ref} · ${SUPPORT_TOPIC_LABEL[ticket.topic]} · opened ${formatDateTime(ticket.created_at)}`}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader title="Conversation" description="Internal notes are shown only to staff." />
          <CardBody className="space-y-5">
            <SupportThread messages={messages} viewer="staff" />
            <StaffSupportReplyForm action={staffSupportMessageAction.bind(null, ticket.id)} />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Requester" />
            <dl className="divide-y divide-line text-sm">
              <div className="px-4 py-2.5 sm:px-5">
                <dt className="text-xs text-muted">Name</dt>
                <dd className="text-ink" data-testid="support-requester">
                  {ticket.requester_name || "No name given"}
                </dd>
              </div>
              <div className="px-4 py-2.5 sm:px-5">
                <dt className="text-xs text-muted">Email</dt>
                <dd className="break-all text-ink">{ticket.requester_email}</dd>
              </div>
              <div className="px-4 py-2.5 sm:px-5">
                <dt className="text-xs text-muted">Business</dt>
                <dd>
                  {ticket.organization_id ? (
                    <Link href={`/app/admin/organizations/${ticket.organization_id}`} className="text-brand hover:underline">
                      {ticket.organization_name}
                    </Link>
                  ) : (
                    <span className="text-muted">Not about a business</span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Handling" />
            <CardBody>
              <ActionForm action={updateSupportTicketAction.bind(null, ticket.id)}>
                <Field name="status" label="Status">
                  <Select name="status" defaultValue={ticket.status}>
                    <option value="open">Needs a reply</option>
                    <option value="waiting">Waiting on requester</option>
                    <option value="resolved">Resolved</option>
                  </Select>
                </Field>
                <Field name="priority" label="Priority">
                  <Select name="priority" defaultValue={ticket.priority}>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </Select>
                </Field>
                <Field name="assignedTo" label="Assigned to">
                  <Select name="assignedTo" defaultValue={ticket.assigned_to ?? ""}>
                    <option value="">Nobody yet</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id === admin.id ? `You (${s.full_name || s.email})` : s.full_name || s.email}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </ActionForm>
              <p className="mt-3 text-[13px] text-muted">
                Resolving tells the requester. They can reply within 30 days to reopen it.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
