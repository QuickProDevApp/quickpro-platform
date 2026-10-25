import "server-only";
import { withUser } from "@/server/db/client";
import type { DocumentStatus, DocumentType, OrganizationKind, ReviewStatus } from "@/lib/labels";
import type { Organization } from "./organizations";
import type { AvailabilityWindow, WorkerProfile } from "./workers";
import type { QualificationDocument } from "./documents";

// Every function here runs as the signed-in staff member. Row level security
// grants staff read access through app.is_admin(); callers must also have
// passed requireAdmin().

export type AdminOverview = {
  pending_organizations: number;
  pending_workers: number;
  pending_documents: number;
  expiring_documents: number;
  approved_contractors: number;
  approved_workers: number;
};

export async function getAdminOverview(adminId: string): Promise<AdminOverview> {
  const [row] = await withUser(adminId, (tx) => tx<AdminOverview[]>`
    select
      (select count(*) from public.organizations where status = 'pending_review')::int as pending_organizations,
      (select count(*) from public.worker_profiles where status = 'pending_review')::int as pending_workers,
      (select count(*) from public.qualification_documents where status = 'pending')::int as pending_documents,
      (select count(*) from public.qualification_documents
         where status = 'approved' and expires_on between current_date and current_date + 30)::int as expiring_documents,
      (select count(*) from public.organizations where kind = 'contractor' and status = 'approved')::int as approved_contractors,
      (select count(*) from public.worker_profiles where status = 'approved')::int as approved_workers
  `);
  return row;
}

export type AdminOrganizationRow = {
  id: string;
  kind: OrganizationKind;
  name: string;
  status: ReviewStatus;
  market_name: string;
  submitted_at: Date | null;
  created_at: Date;
  owner_email: string | null;
  pending_documents: number;
};

export function listOrganizationsForAdmin(
  adminId: string,
  filter: { status?: ReviewStatus; kind?: OrganizationKind },
) {
  return withUser(adminId, (tx) => tx<AdminOrganizationRow[]>`
    select o.id, o.kind, o.name, o.status, mk.name as market_name, o.submitted_at, o.created_at,
           (select p.email from public.organization_members m join public.profiles p on p.id = m.user_id
             where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1) as owner_email,
           (select count(*) from public.qualification_documents d
             where d.organization_id = o.id and d.status = 'pending')::int as pending_documents
    from public.organizations o
    join public.markets mk on mk.id = o.market_id
    where (${filter.status ?? null}::public.review_status is null or o.status = ${filter.status ?? null}::public.review_status)
      and (${filter.kind ?? null}::public.organization_kind is null or o.kind = ${filter.kind ?? null}::public.organization_kind)
    order by (o.status = 'pending_review') desc, o.submitted_at asc nulls last, o.created_at desc
    limit 200
  `);
}

export type OrganizationDetail = {
  organization: Organization & { reviewer_email: string | null };
  members: { user_id: string; role: string; full_name: string; email: string; phone: string | null }[];
  categories: string[];
  areas: string[];
  documents: QualificationDocument[];
};

export async function getOrganizationDetailForAdmin(adminId: string, orgId: string): Promise<OrganizationDetail | null> {
  return withUser(adminId, async (tx) => {
    const [organization] = await tx<(Organization & { reviewer_email: string | null })[]>`
      select o.*, mk.name as market_name, r.email as reviewer_email
      from public.organizations o
      join public.markets mk on mk.id = o.market_id
      left join public.profiles r on r.id = o.reviewed_by
      where o.id = ${orgId}
    `;
    if (!organization) return null;
    const members = await tx<OrganizationDetail["members"]>`
      select m.user_id, m.role, p.full_name, p.email, p.phone
      from public.organization_members m join public.profiles p on p.id = m.user_id
      where m.organization_id = ${orgId} order by m.created_at
    `;
    const categories = await tx<{ name: string }[]>`
      select c.name from public.contractor_services s join public.service_categories c on c.id = s.category_id
      where s.organization_id = ${orgId} order by c.sort_order
    `;
    const areas = await tx<{ name: string }[]>`
      select a.name from public.contractor_service_areas s join public.service_areas a on a.id = s.service_area_id
      where s.organization_id = ${orgId} order by a.name
    `;
    const documents = await tx<QualificationDocument[]>`
      select id, organization_id, worker_user_id, doc_type, title, file_name, mime_type, size_bytes,
             to_char(expires_on, 'YYYY-MM-DD') as expires_on, status, review_notes, reviewed_at, created_at
      from public.qualification_documents where organization_id = ${orgId} order by created_at desc
    `;
    return {
      organization,
      members,
      categories: categories.map((c) => c.name),
      areas: areas.map((a) => a.name),
      documents,
    };
  });
}

export type AdminWorkerRow = {
  user_id: string;
  full_name: string;
  email: string;
  headline: string;
  status: ReviewStatus;
  home_area_name: string | null;
  submitted_at: Date | null;
  created_at: Date;
};

export function listWorkersForAdmin(adminId: string, filter: { status?: ReviewStatus }) {
  return withUser(adminId, (tx) => tx<AdminWorkerRow[]>`
    select w.user_id, p.full_name, p.email, w.headline, w.status, a.name as home_area_name, w.submitted_at, w.created_at
    from public.worker_profiles w
    join public.profiles p on p.id = w.user_id
    left join public.service_areas a on a.id = w.home_service_area_id
    where (${filter.status ?? null}::public.review_status is null or w.status = ${filter.status ?? null}::public.review_status)
    order by (w.status = 'pending_review') desc, w.submitted_at asc nulls last, w.created_at desc
    limit 200
  `);
}

export type WorkerDetail = {
  profile: WorkerProfile & { full_name: string; email: string; phone: string | null };
  skills: string[];
  areas: string[];
  availability: AvailabilityWindow[];
  documents: QualificationDocument[];
};

export async function getWorkerDetailForAdmin(adminId: string, workerId: string): Promise<WorkerDetail | null> {
  return withUser(adminId, async (tx) => {
    const [profile] = await tx<WorkerDetail["profile"][]>`
      select w.*, a.name as home_area_name, p.full_name, p.email, p.phone
      from public.worker_profiles w
      join public.profiles p on p.id = w.user_id
      left join public.service_areas a on a.id = w.home_service_area_id
      where w.user_id = ${workerId}
    `;
    if (!profile) return null;
    const skills = await tx<{ name: string }[]>`
      select s.name from public.worker_skills ws join public.skills s on s.id = ws.skill_id
      where ws.user_id = ${workerId} order by s.sort_order
    `;
    const areas = await tx<{ name: string }[]>`
      select a.name from public.worker_service_areas wa join public.service_areas a on a.id = wa.service_area_id
      where wa.user_id = ${workerId} order by a.name
    `;
    const availability = await tx<AvailabilityWindow[]>`
      select id, weekday, start_time::text, end_time::text from public.worker_availability
      where user_id = ${workerId} order by weekday, start_time
    `;
    const documents = await tx<QualificationDocument[]>`
      select id, organization_id, worker_user_id, doc_type, title, file_name, mime_type, size_bytes,
             to_char(expires_on, 'YYYY-MM-DD') as expires_on, status, review_notes, reviewed_at, created_at
      from public.qualification_documents where worker_user_id = ${workerId} order by created_at desc
    `;
    return {
      profile,
      skills: skills.map((s) => s.name),
      areas: areas.map((a) => a.name),
      availability,
      documents,
    };
  });
}

export type DocumentQueueRow = {
  id: string;
  doc_type: DocumentType;
  title: string;
  status: DocumentStatus;
  expires_on: string | null;
  created_at: Date;
  owner_name: string;
  owner_href: string;
};

export function listDocumentQueue(adminId: string, filter: { status?: DocumentStatus; expiring?: boolean }) {
  return withUser(adminId, (tx) => tx<DocumentQueueRow[]>`
    select d.id, d.doc_type, d.title, d.status, to_char(d.expires_on, 'YYYY-MM-DD') as expires_on, d.created_at,
           coalesce(o.name, nullif(p.full_name, ''), p.email) as owner_name,
           case when d.organization_id is not null then '/app/admin/organizations/' || d.organization_id
                else '/app/admin/workers/' || d.worker_user_id end as owner_href
    from public.qualification_documents d
    left join public.organizations o on o.id = d.organization_id
    left join public.profiles p on p.id = d.worker_user_id
    where (${filter.status ?? null}::public.document_status is null or d.status = ${filter.status ?? null}::public.document_status)
      and (not ${filter.expiring ?? false} or (d.status = 'approved' and d.expires_on between current_date and current_date + 30))
    order by case when ${filter.expiring ?? false} then d.expires_on end asc nulls last, d.created_at asc
    limit 200
  `);
}

export async function reviewOrganization(adminId: string, orgId: string, decision: ReviewStatus, notes: string) {
  await withUser(adminId, (tx) => tx`select public.review_organization(${orgId}, ${decision}, ${notes})`);
}

export async function reviewWorker(adminId: string, workerId: string, decision: ReviewStatus, notes: string) {
  await withUser(adminId, (tx) => tx`select public.review_worker_profile(${workerId}, ${decision}, ${notes})`);
}

export async function reviewDocument(
  adminId: string,
  documentId: string,
  decision: DocumentStatus,
  notes: string,
  expiresOn: string | null,
) {
  const rows = await withUser(adminId, async (tx) => {
    await tx`select public.review_document(${documentId}, ${decision}, ${notes}, ${expiresOn}::date)`;
    return tx<{ organization_id: string | null; worker_user_id: string | null }[]>`
      select organization_id, worker_user_id from public.qualification_documents where id = ${documentId}
    `;
  });
  return rows[0];
}

export type AuditEntry = {
  id: string;
  occurred_at: Date;
  action: string;
  entity_type: string;
  entity_id: string;
  organization_id: string | null;
  actor_email: string | null;
  db_role: string;
  changes: Record<string, unknown>;
};

export function listAuditLog(
  adminId: string,
  filter: { entityType?: string; entityId?: string; organizationId?: string; before?: string },
) {
  return withUser(adminId, (tx) => tx<AuditEntry[]>`
    select l.id::text, l.occurred_at, l.action, l.entity_type, l.entity_id, l.organization_id,
           p.email as actor_email, l.db_role, l.changes
    from public.audit_log l
    left join public.profiles p on p.id = l.actor_user_id
    where (${filter.entityType ?? null}::text is null or l.entity_type = ${filter.entityType ?? null})
      and (${filter.entityId ?? null}::text is null or l.entity_id = ${filter.entityId ?? null})
      and (${filter.organizationId ?? null}::uuid is null or l.organization_id = ${filter.organizationId ?? null}::uuid)
      and (${filter.before ?? null}::bigint is null or l.id < ${filter.before ?? null}::bigint)
    order by l.id desc
    limit 100
  `);
}
