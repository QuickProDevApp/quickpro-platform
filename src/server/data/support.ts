import "server-only";
import { withUser } from "@/server/db/client";
import type { Tx } from "@/server/db/rls";

// Support requests to QuickPro staff (D-031). Anyone signed in opens one;
// they and staff talk on it, and staff can add internal notes the person
// never sees. Row level security decides who reads what; the database
// functions make every change.

export type SupportTopic = "account" | "verification" | "jobs" | "projects" | "billing" | "safety" | "technical" | "other";
export type SupportStatus = "open" | "waiting" | "resolved";
export type SupportPriority = "normal" | "high" | "urgent";

export type SupportTicket = {
  id: string;
  ref: number;
  requester_id: string;
  requester_name: string | null;
  requester_email: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_kind: "customer" | "contractor" | null;
  topic: SupportTopic;
  subject: string;
  status: SupportStatus;
  priority: SupportPriority;
  assigned_to: string | null;
  assignee_name: string | null;
  last_message_at: Date;
  last_message_side: "requester" | "staff";
  resolved_at: Date | null;
  created_at: Date;
  message_count: number;
};

export type SupportMessage = {
  id: string;
  author_id: string | null;
  author_side: "requester" | "staff";
  /** Staff names are shown to staff only; the person sees "QuickPro support". */
  author_name: string | null;
  body: string;
  internal: boolean;
  created_at: Date;
};

export type AdminSupportFilter = "needs_reply" | "waiting" | "mine" | "resolved" | "all";

// Columns shared by the lists and the detail page. Names come through
// row level security: staff see everyone; the person sees their own name and
// their businesses, and no staff names.
const ticketColumns = (tx: Tx) => tx`
  t.id, t.ref::int as ref, t.requester_id, rp.full_name as requester_name, rp.email as requester_email,
  t.organization_id, o.name as organization_name, o.kind as organization_kind,
  t.topic, t.subject, t.status, t.priority, t.assigned_to, ap.full_name as assignee_name,
  t.last_message_at, t.last_message_side, t.resolved_at, t.created_at,
  (select count(*)::int from public.support_messages m where m.ticket_id = t.id and not m.internal) as message_count
`;

const ticketJoins = (tx: Tx) => tx`
  public.support_tickets t
  left join public.profiles rp on rp.id = t.requester_id
  left join public.profiles ap on ap.id = t.assigned_to
  left join public.organizations o on o.id = t.organization_id
`;

/** The signed-in person's own requests, most recent activity first. */
export function listMySupportTickets(userId: string) {
  return withUser(userId, (tx) => tx<SupportTicket[]>`
    select ${ticketColumns(tx)} from ${ticketJoins(tx)}
    where t.requester_id = ${userId}
    order by (t.status = 'resolved'), t.last_message_at desc
  `);
}

export async function getSupportTicket(userId: string, ticketId: string): Promise<SupportTicket | null> {
  const [row] = await withUser(userId, (tx) => tx<SupportTicket[]>`
    select ${ticketColumns(tx)} from ${ticketJoins(tx)} where t.id = ${ticketId}
  `);
  return row ?? null;
}

export function listSupportMessages(userId: string, ticketId: string) {
  return withUser(userId, (tx) => tx<SupportMessage[]>`
    select m.id, m.author_id, m.author_side,
           case when m.author_side = 'staff' and not app.is_admin() then null else p.full_name end as author_name,
           m.body, m.internal, m.created_at
    from public.support_messages m
    left join public.profiles p on p.id = m.author_id
    where m.ticket_id = ${ticketId}
    order by m.created_at, m.id
  `);
}

/** The staff queue. Needing a reply: urgent first, then longest waiting. */
export function listAdminSupportTickets(adminId: string, filter: AdminSupportFilter) {
  return withUser(adminId, (tx) => tx<SupportTicket[]>`
    select ${ticketColumns(tx)} from ${ticketJoins(tx)}
    where app.is_admin()
      and case ${filter}::text
            when 'needs_reply' then t.status = 'open'
            when 'waiting' then t.status = 'waiting'
            when 'mine' then t.status <> 'resolved' and t.assigned_to = ${adminId}
            when 'resolved' then t.status = 'resolved'
            else true
          end
    order by
      case when ${filter}::text in ('resolved', 'all') then null else array_position(array['urgent', 'high', 'normal'], t.priority::text) end,
      case when ${filter}::text in ('resolved', 'all') then t.last_message_at end desc nulls last,
      t.last_message_at
    limit 200
  `);
}

export async function getSupportCounts(adminId: string) {
  const [row] = await withUser(adminId, (tx) => tx<{ needs_reply: number; urgent: number; waiting: number; mine: number }[]>`
    select count(*) filter (where status = 'open')::int as needs_reply,
           count(*) filter (where status = 'open' and priority = 'urgent')::int as urgent,
           count(*) filter (where status = 'waiting')::int as waiting,
           count(*) filter (where status <> 'resolved' and assigned_to = ${adminId})::int as mine
    from public.support_tickets
    where app.is_admin()
  `);
  return row;
}

/** QuickPro staff, for assigning requests. */
export function listStaffMembers(adminId: string) {
  return withUser(adminId, (tx) => tx<{ id: string; full_name: string; email: string }[]>`
    select id, full_name, email from public.profiles where platform_role = 'admin' and app.is_admin() order by full_name, email
  `);
}

export async function openSupportTicket(
  userId: string,
  input: { topic: SupportTopic; subject: string; body: string; organizationId: string | null },
) {
  const [{ id }] = await withUser(userId, (tx) => tx<{ id: string }[]>`
    select public.open_support_ticket(${input.topic}::public.support_topic, ${input.subject}, ${input.body}, ${input.organizationId}) as id
  `);
  return id;
}

export async function postSupportMessage(userId: string, ticketId: string, body: string, internal: boolean) {
  await withUser(userId, (tx) => tx`select public.post_support_message(${ticketId}, ${body}, ${internal})`);
}

export async function updateSupportTicket(
  adminId: string,
  ticketId: string,
  input: { status: SupportStatus; priority: SupportPriority; assignedTo: string | null },
) {
  await withUser(adminId, (tx) => tx`
    select public.update_support_ticket(${ticketId}, ${input.status}::public.support_status,
                                        ${input.priority}::public.support_priority, ${input.assignedTo})
  `);
}

export async function resolveMySupportTicket(userId: string, ticketId: string) {
  await withUser(userId, (tx) => tx`select public.resolve_my_support_ticket(${ticketId})`);
}
