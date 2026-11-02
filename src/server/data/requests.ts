import "server-only";
import { withUser, type Tx } from "@/server/db/client";
import type { AssignmentStatus, JobStatus, QuoteStatus, RequestStatus } from "@/lib/labels";
import type { QuoteInput, ServiceRequestInput } from "@/lib/schemas";

// Service requests and quotes. Every query runs as the signed-in user under
// row level security: a contractor sees only open requests it serves or was
// invited to, plus requests it quoted on, and only its own quote. Status
// changes go through the database workflow functions.

export type ServiceRequest = {
  id: string;
  organization_id: string;
  customer_name: string;
  title: string;
  description: string;
  requirements: string;
  category_id: string;
  category_name: string;
  service_area_id: string;
  area_name: string;
  preferred_start: string;
  preferred_end: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  status: RequestStatus;
  awarded_quote_id: string | null;
  awarded_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  /** Set when the awarded contractor reported the work complete; cleared if the customer sends it back. */
  work_completed_at: Date | null;
  completion_note: string | null;
  /** The contractor that won, for the customer, that contractor and staff. */
  awarded_contractor_id: string | null;
  awarded_contractor_name: string | null;
  awarded_amount_cents: number | null;
  /** Jobs scheduled for the project (customer, awarded contractor and staff; 0 for anyone else). */
  project_job_count: number;
  /** Quotes the viewer can see: all of them for the customer and staff, its own for a contractor. */
  quote_count: number;
  lowest_quote_cents: number | null;
};

export type RequestSite = {
  address_line1: string;
  city: string;
  postal_code: string;
  access_notes: string;
  contact_name: string;
  contact_phone: string;
};

export type Quote = {
  id: string;
  request_id: string;
  contractor_id: string;
  contractor_name: string;
  amount_cents: number;
  scope: string;
  estimated_start: string | null;
  valid_until: string;
  status: QuoteStatus;
  submitted_at: Date;
  decided_at: Date | null;
  decision_note: string | null;
  revision: number;
  /** valid_until is before today in New York. */
  expired: boolean;
};

function requestColumns(tx: Tx) {
  return tx`
    r.id, r.organization_id, o.name as customer_name, r.title, r.description, r.requirements,
    r.category_id, c.name as category_name, r.service_area_id, a.name as area_name,
    to_char(r.preferred_start, 'YYYY-MM-DD') as preferred_start,
    to_char(r.preferred_end, 'YYYY-MM-DD') as preferred_end,
    r.budget_min_cents, r.budget_max_cents, r.status, r.awarded_quote_id, r.awarded_at, r.completed_at,
    r.cancelled_at, r.cancel_reason, r.created_at, r.work_completed_at, r.completion_note,
    (select aq.contractor_id from public.quotes aq where aq.id = r.awarded_quote_id) as awarded_contractor_id,
    (select p.name from public.quotes aq join public.request_party_names(r.id) p on p.organization_id = aq.contractor_id
      where aq.id = r.awarded_quote_id) as awarded_contractor_name,
    (select aq.amount_cents from public.quotes aq where aq.id = r.awarded_quote_id) as awarded_amount_cents,
    case when r.awarded_quote_id is not null and app.can_see_request_site(r.id)
         then (select count(*)::int from public.request_jobs(r.id)) else 0 end as project_job_count,
    (select count(*)::int from public.quotes q where q.request_id = r.id and q.status in ('submitted', 'accepted')) as quote_count,
    (select min(q.amount_cents)::int from public.quotes q where q.request_id = r.id and q.status in ('submitted', 'accepted')) as lowest_quote_cents
  `;
}

// The customer's name comes from request_party_names, which only answers for
// people who can see the request; organizations themselves are private.
function requestFrom(tx: Tx) {
  return tx`
    public.service_requests r
    join public.service_categories c on c.id = r.category_id
    join public.service_areas a on a.id = r.service_area_id
    cross join lateral (
      select p.name from public.request_party_names(r.id) p where p.organization_id = r.organization_id
    ) o
  `;
}

function quoteColumns(tx: Tx) {
  return tx`
    q.id, q.request_id, q.contractor_id,
    coalesce((select p.name from public.request_party_names(q.request_id) p where p.organization_id = q.contractor_id), 'Contractor') as contractor_name,
    q.amount_cents, q.scope, to_char(q.estimated_start, 'YYYY-MM-DD') as estimated_start,
    to_char(q.valid_until, 'YYYY-MM-DD') as valid_until, q.status, q.submitted_at, q.decided_at, q.decision_note, q.revision,
    q.valid_until < (now() at time zone 'America/New_York')::date as expired
  `;
}

export type CustomerRequestFilter = "active" | "closed" | "all";

export function listCustomerRequests(userId: string, orgId: string, filter: CustomerRequestFilter) {
  return withUser(userId, (tx) => tx<ServiceRequest[]>`
    select ${requestColumns(tx)} from ${requestFrom(tx)}
    where r.organization_id = ${orgId}
      and ${filter === "active" ? tx`r.status in ('open', 'awarded')` : filter === "closed" ? tx`r.status in ('completed', 'cancelled')` : tx`true`}
    order by case r.status when 'open' then 0 when 'awarded' then 1 else 2 end, r.preferred_start, r.created_at desc
  `);
}

export type ContractorRequestFilter = "open" | "quoted" | "awarded";

export type ContractorRequestRow = ServiceRequest & {
  my_quote_id: string | null;
  my_quote_status: QuoteStatus | null;
  my_quote_cents: number | null;
  invited: boolean;
};

/**
 * Requests for a contractor: open ones it can quote (not quoted yet, or
 * withdrawn), ones with a live or decided quote, and work it won.
 */
export function listContractorRequests(userId: string, contractorId: string, filter: ContractorRequestFilter) {
  return withUser(userId, (tx) => tx<ContractorRequestRow[]>`
    select ${requestColumns(tx)}, mq.id as my_quote_id, mq.status as my_quote_status, mq.amount_cents as my_quote_cents,
           exists (select 1 from public.service_request_invitations i where i.request_id = r.id and i.contractor_id = ${contractorId}) as invited
    from ${requestFrom(tx)}
    left join public.quotes mq on mq.request_id = r.id and mq.contractor_id = ${contractorId}
    where app.contractor_can_see_request(r.id, ${contractorId})
      and ${
        filter === "open"
          ? tx`r.status = 'open' and (mq.id is null or mq.status = 'withdrawn')`
          : filter === "quoted"
            ? tx`mq.status in ('submitted', 'declined') or (mq.status = 'withdrawn' and r.status <> 'open')`
            : tx`mq.status = 'accepted'`
      }
    order by ${filter === "open" ? tx`r.preferred_start, r.created_at` : tx`coalesce(mq.decided_at, mq.submitted_at) desc`}
  `);
}

export function countOpenRequestsForContractor(userId: string, contractorId: string) {
  return withUser(userId, async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from public.service_requests r
      left join public.quotes mq on mq.request_id = r.id and mq.contractor_id = ${contractorId}
      where r.status = 'open' and (mq.id is null or mq.status = 'withdrawn') and app.contractor_can_see_request(r.id, ${contractorId})
    `;
    return n;
  });
}

export async function getRequest(userId: string, requestId: string): Promise<ServiceRequest | null> {
  const [row] = await withUser(userId, (tx) => tx<ServiceRequest[]>`
    select ${requestColumns(tx)} from ${requestFrom(tx)} where r.id = ${requestId}
  `);
  return row ?? null;
}

export async function getRequestSite(userId: string, requestId: string): Promise<RequestSite | null> {
  const [row] = await withUser(userId, (tx) => tx<RequestSite[]>`
    select address_line1, city, postal_code, access_notes, contact_name, contact_phone
    from public.service_request_sites where request_id = ${requestId}
  `);
  return row ?? null;
}

/** Quotes on a request that the viewer may see, best offers first. */
export function listRequestQuotes(userId: string, requestId: string) {
  return withUser(userId, (tx) => tx<Quote[]>`
    select ${quoteColumns(tx)} from public.quotes q where q.request_id = ${requestId}
    order by case q.status when 'accepted' then 0 when 'submitted' then 1 when 'declined' then 2 else 3 end, q.amount_cents
  `);
}

export async function getContractorQuote(userId: string, requestId: string, contractorId: string): Promise<Quote | null> {
  const [row] = await withUser(userId, (tx) => tx<Quote[]>`
    select ${quoteColumns(tx)} from public.quotes q where q.request_id = ${requestId} and q.contractor_id = ${contractorId}
  `);
  return row ?? null;
}

export async function isInvited(userId: string, requestId: string, contractorId: string) {
  const rows = await withUser(userId, (tx) => tx`
    select 1 from public.service_request_invitations where request_id = ${requestId} and contractor_id = ${contractorId}
  `);
  return rows.length > 0;
}

export function listInvitedContractorIds(userId: string, requestId: string) {
  return withUser(userId, async (tx) =>
    (await tx<{ contractor_id: string }[]>`
      select contractor_id from public.service_request_invitations where request_id = ${requestId}
    `).map((r) => r.contractor_id),
  );
}

export function createRequest(userId: string, orgId: string, input: ServiceRequestInput) {
  return withUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      insert into public.service_requests
        (organization_id, title, description, requirements, category_id, service_area_id, preferred_start, preferred_end,
         budget_min_cents, budget_max_cents, created_by)
      values (${orgId}, ${input.title}, ${input.description}, ${input.requirements}, ${input.categoryId}, ${input.serviceAreaId},
              ${input.preferredStart}, ${input.preferredEnd}, ${input.budgetMin}, ${input.budgetMax}, ${userId})
      returning id
    `;
    await tx`
      insert into public.service_request_sites (request_id, address_line1, city, postal_code, access_notes, contact_name, contact_phone)
      values (${id}, ${input.addressLine1}, ${input.city}, ${input.postalCode}, ${input.accessNotes},
              ${input.contactName}, ${input.contactPhone})
    `;
    return id;
  });
}

export function inviteContractor(userId: string, requestId: string, contractorId: string) {
  return withUser(userId, (tx) => tx`select public.invite_contractor_to_quote(${requestId}, ${contractorId})`);
}

export function submitQuote(userId: string, requestId: string, contractorId: string, input: QuoteInput) {
  return withUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      select public.submit_quote(${requestId}, ${contractorId}, ${input.amount}, ${input.scope},
                                 ${input.estimatedStart}, ${input.validUntil}) as id
    `;
    return id;
  });
}

export function withdrawQuote(userId: string, quoteId: string) {
  return withUser(userId, (tx) => tx`select public.withdraw_quote(${quoteId})`);
}

export function acceptQuote(userId: string, quoteId: string) {
  return withUser(userId, (tx) => tx`select public.accept_quote(${quoteId})`);
}

export function declineQuote(userId: string, quoteId: string, note: string) {
  return withUser(userId, (tx) => tx`select public.decline_quote(${quoteId}, ${note})`);
}

export function cancelRequest(userId: string, requestId: string, reason: string) {
  return withUser(userId, (tx) => tx`select public.cancel_service_request(${requestId}, ${reason})`);
}

/** Staff close an awarded request directly. */
export function completeRequest(userId: string, requestId: string) {
  return withUser(userId, (tx) => tx`select public.complete_service_request(${requestId})`);
}

// Project delivery ---------------------------------------------------------------

export type ProjectJob = {
  id: string;
  title: string;
  status: JobStatus;
  starts_at: Date;
  ends_at: Date;
  headcount: number;
  booked: number;
  checked_in: number;
  checked_out: number;
  completed_at: Date | null;
};

export type ProjectAttendance = {
  job_id: string;
  worker_name: string;
  status: AssignmentStatus;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
};

export type ProjectEvent = {
  id: string;
  kind: string;
  summary: string;
  detail: string;
  job_id: string | null;
  actor_label: string;
  created_at: Date;
};

export type ProjectMessage = {
  id: string;
  author_id: string | null;
  author_name: string;
  author_side: "customer" | "contractor" | "staff";
  organization_name: string | null;
  body: string;
  created_at: Date;
};

/** Jobs scheduled for an awarded request, for the customer, the awarded contractor and staff. */
export function listProjectJobs(userId: string, requestId: string) {
  return withUser(userId, (tx) => tx<ProjectJob[]>`select * from public.request_jobs(${requestId})`);
}

export function listProjectAttendance(userId: string, requestId: string) {
  return withUser(userId, (tx) => tx<ProjectAttendance[]>`select * from public.request_attendance(${requestId})`);
}

/** The project's history, oldest first. */
export function listProjectEvents(userId: string, requestId: string) {
  return withUser(userId, (tx) => tx<ProjectEvent[]>`
    select e.id, e.kind, e.summary, e.detail, e.job_id, e.actor_label, e.created_at
    from public.service_request_events e
    where e.request_id = ${requestId}
    order by e.created_at, e.id
  `);
}

/** Shaped like a job thread so the same message view renders it. Project messages are never hidden. */
export function getProjectThread(userId: string, requestId: string) {
  return withUser(userId, (tx) => tx<(ProjectMessage & { hidden: false; hidden_reason: null })[]>`
    select *, false as hidden, null::text as hidden_reason from public.request_thread(${requestId})
  `);
}

export function postProjectMessage(userId: string, requestId: string, body: string) {
  return withUser(userId, (tx) => tx`select public.post_request_message(${requestId}, ${body})`);
}

export function reportWorkComplete(userId: string, requestId: string, note: string) {
  return withUser(userId, (tx) => tx`select public.report_request_work_complete(${requestId}, ${note})`);
}

export function confirmCompletion(userId: string, requestId: string) {
  return withUser(userId, (tx) => tx`select public.confirm_request_completion(${requestId})`);
}

export function reopenWork(userId: string, requestId: string, reason: string) {
  return withUser(userId, (tx) => tx`select public.reopen_request_work(${requestId}, ${reason})`);
}

export type DirectoryContractor = {
  id: string;
  name: string;
  description: string;
  years_in_business: number | null;
  crew_size: number | null;
  website: string | null;
  category_names: string[];
  area_names: string[];
  serves_category: boolean;
  serves_area: boolean;
  insurance_reviewed: boolean;
};

export function contractorDirectory(userId: string, customerId: string, categoryId: string | null, areaId: string | null) {
  return withUser(userId, (tx) => tx<DirectoryContractor[]>`
    select * from public.contractor_directory(${customerId}, ${categoryId}, ${areaId})
  `);
}

// Staff -----------------------------------------------------------------------

export type AdminRequestFilter = "unquoted" | "open" | "awarded" | "closed" | "all";

export function listAllRequests(userId: string, filter: AdminRequestFilter) {
  return withUser(userId, (tx) => tx<ServiceRequest[]>`
    select ${requestColumns(tx)} from ${requestFrom(tx)}
    where ${
      filter === "unquoted"
        ? tx`r.status = 'open' and r.created_at < now() - interval '3 days'
             and not exists (select 1 from public.quotes q where q.request_id = r.id and q.status = 'submitted')`
        : filter === "open"
        ? tx`r.status = 'open'`
        : filter === "awarded"
          ? tx`r.status = 'awarded'`
          : filter === "closed"
            ? tx`r.status in ('completed', 'cancelled')`
            : tx`true`
    }
    order by r.created_at desc
    limit 200
  `);
}

export function getRequestCountsForAdmin(userId: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx<{ open_requests: number; unquoted_stale: number; awarded_requests: number }[]>`
      select
        count(*) filter (where r.status = 'open')::int as open_requests,
        count(*) filter (where r.status = 'open' and r.created_at < now() - interval '3 days'
                           and not exists (select 1 from public.quotes q where q.request_id = r.id and q.status = 'submitted'))::int as unquoted_stale,
        count(*) filter (where r.status = 'awarded')::int as awarded_requests
      from public.service_requests r
    `;
    return row;
  });
}
