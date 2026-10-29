import "server-only";
import { withUser, type Tx } from "@/server/db/client";
import type { InsuranceStatus, OrganizationKind, ReviewStatus } from "@/lib/labels";
import { diffIds } from "./sets";

export type MemberRole = "owner" | "admin" | "dispatcher" | "member";

export type OrganizationSummary = {
  id: string;
  kind: OrganizationKind;
  name: string;
  status: ReviewStatus;
  role: MemberRole;
};

export type Organization = {
  id: string;
  kind: OrganizationKind;
  name: string;
  legal_name: string | null;
  description: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
  market_id: string;
  market_name: string;
  years_in_business: number | null;
  crew_size: number | null;
  status: ReviewStatus;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  /** Why an approved organization went back to review; cleared by the next staff decision. */
  rereview_reason: string | null;
  created_at: Date;
};

export type OrganizationWithRole = Organization & { my_role: MemberRole };

export function listMyOrganizations(userId: string) {
  return withUser(userId, (tx) => tx<OrganizationSummary[]>`
    select o.id, o.kind, o.name, o.status, m.role
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = ${userId}
    order by o.created_at
  `);
}

export async function getMyOrganization(userId: string, orgId: string): Promise<OrganizationWithRole | null> {
  const rows = await withUser(userId, (tx) => tx<OrganizationWithRole[]>`
    select o.*, mk.name as market_name, m.role as my_role
    from public.organizations o
    join public.markets mk on mk.id = o.market_id
    join public.organization_members m on m.organization_id = o.id and m.user_id = ${userId}
    where o.id = ${orgId}
  `);
  return rows[0] ?? null;
}

export function canManage(role: MemberRole) {
  return role === "owner" || role === "admin";
}

/** Owners, admins and dispatchers post jobs and manage crews. */
export function canDispatch(role: MemberRole) {
  return canManage(role) || role === "dispatcher";
}

export async function createOrganization(userId: string, kind: OrganizationKind, name: string, marketId: string) {
  const [row] = await withUser(userId, (tx) => tx<{ id: string }[]>`
    select public.create_organization(${kind}, ${name}, ${marketId}) as id
  `);
  return row.id;
}

export type OrganizationProfileInput = {
  name: string;
  legalName: string | null;
  description: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine1: string | null;
  city: string | null;
  postalCode: string | null;
  yearsInBusiness: number | null;
  crewSize: number | null;
};

export async function updateOrganizationProfile(userId: string, orgId: string, input: OrganizationProfileInput) {
  const result = await withUser(userId, (tx) => tx`
    update public.organizations set
      name = ${input.name},
      legal_name = ${input.legalName},
      description = ${input.description},
      phone = ${input.phone},
      email = ${input.email},
      website = ${input.website},
      address_line1 = ${input.addressLine1},
      city = ${input.city},
      postal_code = ${input.postalCode},
      years_in_business = ${input.yearsInBusiness},
      crew_size = ${input.crewSize}
    where id = ${orgId}
  `);
  return result.count === 1;
}

export type ContractorCapabilities = { categoryIds: string[]; areaIds: string[] };

export async function getContractorCapabilities(userId: string, orgId: string): Promise<ContractorCapabilities> {
  return withUser(userId, async (tx) => {
    const categories = await tx<{ category_id: string }[]>`
      select category_id from public.contractor_services where organization_id = ${orgId}
    `;
    const areas = await tx<{ service_area_id: string }[]>`
      select service_area_id from public.contractor_service_areas where organization_id = ${orgId}
    `;
    return {
      categoryIds: categories.map((r) => r.category_id),
      areaIds: areas.map((r) => r.service_area_id),
    };
  });
}

async function replaceSet(
  tx: Tx,
  table: "contractor_services" | "contractor_service_areas",
  column: "category_id" | "service_area_id",
  orgId: string,
  desired: string[],
) {
  const current = await tx<{ id: string }[]>`
    select ${tx(column)} as id from ${tx("public." + table)} where organization_id = ${orgId}
  `;
  const { add, remove } = diffIds(
    current.map((r) => r.id),
    desired,
  );
  if (remove.length) {
    await tx`delete from ${tx("public." + table)} where organization_id = ${orgId} and ${tx(column)} in ${tx(remove)}`;
  }
  for (const id of add) {
    await tx`insert into ${tx("public." + table)} (organization_id, ${tx(column)}) values (${orgId}, ${id})`;
  }
}

export function setContractorCapabilities(userId: string, orgId: string, input: ContractorCapabilities) {
  return withUser(userId, async (tx) => {
    await replaceSet(tx, "contractor_services", "category_id", orgId, input.categoryIds);
    await replaceSet(tx, "contractor_service_areas", "service_area_id", orgId, input.areaIds);
  });
}

export async function getInsuranceStatus(userId: string, orgId: string): Promise<InsuranceStatus | null> {
  const [row] = await withUser(userId, (tx) => tx<{ status: InsuranceStatus | null }[]>`
    select public.organization_insurance_status(${orgId}) as status
  `);
  return row?.status ?? null;
}

export async function submitOrganizationForReview(userId: string, orgId: string) {
  await withUser(userId, (tx) => tx`select public.submit_organization_for_review(${orgId})`);
}

export type ReadinessItem = { label: string; done: boolean; href: string };

/**
 * Mirrors the checks in public.submit_organization_for_review so the
 * dashboard can show progress. The database function remains the authority.
 */
export async function getOrganizationReadiness(userId: string, org: Organization): Promise<ReadinessItem[]> {
  const base = `/app/org/${org.id}`;
  const items: ReadinessItem[] = [
    { label: "Business phone and email", done: Boolean(org.phone && org.email), href: `${base}/profile` },
  ];
  if (org.kind === "customer") {
    items.push({
      label: "Business address",
      done: Boolean(org.address_line1 && org.city && org.postal_code),
      href: `${base}/profile`,
    });
    return items;
  }
  const [caps, [{ has_gl }]] = await Promise.all([
    getContractorCapabilities(userId, org.id),
    withUser(userId, (tx) => tx<{ has_gl: boolean }[]>`
      select exists (
        select 1 from public.qualification_documents
        where organization_id = ${org.id}
          and doc_type = 'general_liability_coi'
          and status in ('pending', 'approved')
          and (expires_on is null or expires_on >= current_date)
      ) as has_gl
    `),
  ]);
  items.push(
    { label: "Legal business name", done: Boolean(org.legal_name), href: `${base}/profile` },
    { label: "At least one service category", done: caps.categoryIds.length > 0, href: `${base}/services` },
    { label: "At least one service area", done: caps.areaIds.length > 0, href: `${base}/services` },
    { label: "General liability certificate of insurance", done: has_gl, href: `${base}/documents` },
  );
  return items;
}
