import "server-only";
import { withUser } from "@/server/db/client";
import type { SubcontractOfferInput } from "@/lib/schemas";

// Subcontracts: the contractor that won a project hands part of it to another
// approved contractor. Every query runs as the signed-in user; the database
// decides who sees amounts (never the customer) and enforces each step.

export type SubcontractStatus = "offered" | "accepted" | "declined" | "cancelled" | "completed";

export type Subcontract = {
  id: string;
  prime_id: string;
  prime_name: string;
  sub_id: string;
  sub_name: string;
  scope: string;
  /** Null for the customer, or when no price was set. */
  amount_cents: number | null;
  status: SubcontractStatus;
  offered_at: Date;
  responded_at: Date | null;
  response_note: string | null;
  completed_at: Date | null;
  completion_note: string | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
};

export type OrgSubcontract = Subcontract & {
  request_id: string;
  request_title: string;
  request_status: string;
  customer_name: string;
  area_name: string;
};

/** Subcontracts on a project that the viewer may see, oldest offer first. */
export function listProjectSubcontracts(userId: string, requestId: string) {
  return withUser(userId, (tx) => tx<Subcontract[]>`select * from public.project_subcontracts(${requestId})`);
}

/**
 * This business's subcontracts on a project as the subcontractor, current one
 * first (a live offer or accepted part, then the latest). Empty when it has none.
 */
export function listMySubcontracts(userId: string, requestId: string, orgId: string) {
  return withUser(userId, async (tx) => {
    const [mine] = await tx`select 1 from public.subcontracts where request_id = ${requestId} and sub_id = ${orgId} limit 1`;
    if (!mine) return [];
    return tx<Subcontract[]>`
      select * from public.project_subcontracts(${requestId}) where sub_id = ${orgId}
      order by case when status in ('offered', 'accepted') then 0 else 1 end, offered_at desc
    `;
  });
}

/**
 * Subcontracts a business is part of, on either side. `side` picks work it
 * handed out ("prime") or took on ("sub").
 */
export function listOrgSubcontracts(userId: string, orgId: string, side: "prime" | "sub") {
  return withUser(userId, (tx) => tx<OrgSubcontract[]>`
    select ps.*, s.request_id, r.title as request_title, r.status as request_status, a.name as area_name,
           coalesce((select p.name from public.request_party_names(r.id) p where p.organization_id = r.organization_id), 'Customer') as customer_name
    from public.subcontracts s
    join public.service_requests r on r.id = s.request_id
    join public.service_areas a on a.id = r.service_area_id
    cross join lateral (select * from public.project_subcontracts(s.request_id) x where x.id = s.id) ps
    where ${side === "prime" ? tx`s.prime_id = ${orgId}` : tx`s.sub_id = ${orgId}`}
    order by case s.status when 'offered' then 0 when 'accepted' then 1 when 'completed' then 2 else 3 end, s.offered_at desc
    limit 200
  `);
}

export type SubcontractorOption = {
  id: string;
  name: string;
  years_in_business: number | null;
  crew_size: number | null;
  category_names: string[];
  area_names: string[];
  serves_category: boolean;
};

export function subcontractorDirectory(userId: string, primeId: string, categoryId: string | null) {
  return withUser(userId, (tx) => tx<SubcontractorOption[]>`
    select * from public.subcontractor_directory(${primeId}, ${categoryId})
  `);
}

export function offerSubcontract(userId: string, requestId: string, input: SubcontractOfferInput) {
  return withUser(userId, async (tx) => {
    const [{ id }] = await tx<{ id: string }[]>`
      select public.offer_subcontract(${requestId}, ${input.subId}, ${input.scope}, ${input.amount}) as id
    `;
    return id;
  });
}

export function respondToSubcontract(userId: string, subcontractId: string, accept: boolean, note: string) {
  return withUser(userId, (tx) => tx`select public.respond_to_subcontract(${subcontractId}, ${accept}, ${note})`);
}

export function cancelSubcontract(userId: string, subcontractId: string, reason: string) {
  return withUser(userId, (tx) => tx`select public.cancel_subcontract(${subcontractId}, ${reason})`);
}

export function completeSubcontract(userId: string, subcontractId: string, note: string) {
  return withUser(userId, (tx) => tx`select public.complete_subcontract(${subcontractId}, ${note})`);
}

export type SubcontractMessage = {
  id: string;
  author_id: string | null;
  author_name: string;
  author_side: "contractor" | "subcontractor" | "staff";
  organization_name: string | null;
  body: string;
  created_at: Date;
};

/** Shaped like a job thread so the same message view renders it. */
export function getSubcontractThread(userId: string, subcontractId: string) {
  return withUser(userId, (tx) => tx<(SubcontractMessage & { hidden: false; hidden_reason: null })[]>`
    select *, false as hidden, null::text as hidden_reason from public.subcontract_thread(${subcontractId})
  `);
}

export function postSubcontractMessage(userId: string, subcontractId: string, body: string) {
  return withUser(userId, (tx) => tx`select public.post_subcontract_message(${subcontractId}, ${body})`);
}
