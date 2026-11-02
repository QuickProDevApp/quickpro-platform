import "server-only";
import { withUser, type Tx } from "@/server/db/client";
import type { ApplicationStatus, AssignmentStatus, JobStatus } from "@/lib/labels";
import type { JobInput } from "@/lib/schemas";
import { diffIds } from "./sets";

// Every function runs as the signed-in user under row level security. Status
// changes go through the database workflow functions, which check who may
// make them; callers still check membership or role first.

export type EngagementType = { id: string; slug: string; name: string; description: string };

export function listEngagementTypes(userId: string) {
  return withUser(userId, (tx) => tx<EngagementType[]>`
    select id, slug, name, description from public.engagement_types where is_active order by sort_order, name
  `);
}

export type JobSite = {
  address_line1: string;
  city: string;
  postal_code: string;
  site_notes: string;
  contact_name: string;
  contact_phone: string;
};

export type Job = {
  id: string;
  organization_id: string;
  organization_name: string | null;
  title: string;
  description: string;
  category_id: string;
  category_name: string;
  service_area_id: string;
  area_name: string;
  starts_at: Date;
  ends_at: Date;
  headcount: number;
  pay_rate_cents: number;
  engagement_type_id: string;
  engagement_name: string;
  engagement_description: string;
  status: JobStatus;
  cancel_reason: string | null;
  completed_at: Date | null;
  created_at: Date;
  /** The customer project this job is part of. The title is visible to the contractor and staff, not to workers. */
  service_request_id: string | null;
  project_title: string | null;
  skill_ids: string[];
  skill_names: string[];
  accepted_count: number;
  offered_count: number;
  applicant_count: number;
  /** Wall-clock values in America/New_York, for the edit form. */
  local_date: string;
  local_start: string;
  local_end: string;
};

/** The columns every job query returns. Counts are visible to org members and staff only (RLS). */
function jobColumns(tx: Tx) {
  return tx`
    j.id, j.organization_id, public.contractor_display_name(j.organization_id) as organization_name,
    j.title, j.description, j.category_id, c.name as category_name, j.service_area_id, a.name as area_name,
    j.starts_at, j.ends_at, j.headcount, j.pay_rate_cents, j.engagement_type_id,
    e.name as engagement_name, e.description as engagement_description,
    j.status, j.cancel_reason, j.completed_at, j.created_at, j.service_request_id,
    (select sr.title from public.service_requests sr where sr.id = j.service_request_id) as project_title,
    coalesce((select array_agg(js.skill_id) from public.job_skills js where js.job_id = j.id), '{}') as skill_ids,
    coalesce((select array_agg(s.name order by s.sort_order) from public.job_skills js
              join public.skills s on s.id = js.skill_id where js.job_id = j.id), '{}') as skill_names,
    (select count(*)::int from public.job_assignments x where x.job_id = j.id and x.status in ('accepted', 'completed')) as accepted_count,
    (select count(*)::int from public.job_assignments x where x.job_id = j.id and x.status = 'offered') as offered_count,
    (select count(*)::int from public.job_applications x where x.job_id = j.id and x.status = 'applied') as applicant_count,
    to_char(j.starts_at at time zone 'America/New_York', 'YYYY-MM-DD') as local_date,
    to_char(j.starts_at at time zone 'America/New_York', 'HH24:MI') as local_start,
    to_char(j.ends_at at time zone 'America/New_York', 'HH24:MI') as local_end
  `;
}

function jobFrom(tx: Tx) {
  return tx`
    public.jobs j
    join public.service_categories c on c.id = j.category_id
    join public.service_areas a on a.id = j.service_area_id
    join public.engagement_types e on e.id = j.engagement_type_id
  `;
}

/** Start and end instants from the form's local date and times; an end at or before the start is the next day. */
function times(tx: Tx, input: JobInput) {
  return {
    startsAt: tx`((${input.date}::date + ${input.startTime}::time) at time zone 'America/New_York')`,
    endsAt: tx`((${input.date}::date + ${input.endTime}::time
                 + case when ${input.endTime}::time <= ${input.startTime}::time then interval '1 day' else interval '0' end)
                at time zone 'America/New_York')`,
  };
}

async function saveSkillsAndSite(tx: Tx, jobId: string, input: JobInput, skillIds: string[]) {
  const current = await tx<{ skill_id: string }[]>`select skill_id from public.job_skills where job_id = ${jobId}`;
  const { add, remove } = diffIds(
    current.map((r) => r.skill_id),
    skillIds,
  );
  if (remove.length) await tx`delete from public.job_skills where job_id = ${jobId} and skill_id in ${tx(remove)}`;
  for (const id of add) await tx`insert into public.job_skills (job_id, skill_id) values (${jobId}, ${id})`;
  await tx`
    insert into public.job_sites (job_id, address_line1, city, postal_code, site_notes, contact_name, contact_phone)
    values (${jobId}, ${input.addressLine1}, ${input.city}, ${input.postalCode}, ${input.siteNotes},
            ${input.contactName}, ${input.contactPhone})
    on conflict (job_id) do update set
      address_line1 = excluded.address_line1, city = excluded.city, postal_code = excluded.postal_code,
      site_notes = excluded.site_notes, contact_name = excluded.contact_name, contact_phone = excluded.contact_phone
  `;
}

/** Job, skills and site in one transaction. With a request id, the job is scheduled for that awarded project. */
export function createJob(userId: string, orgId: string, input: JobInput, skillIds: string[], requestId: string | null = null) {
  return withUser(userId, async (tx) => {
    const { startsAt, endsAt } = times(tx, input);
    const [{ id }] = await tx<{ id: string }[]>`
      insert into public.jobs (organization_id, title, description, category_id, service_area_id, starts_at, ends_at,
                               headcount, pay_rate_cents, engagement_type_id, created_by, service_request_id)
      values (${orgId}, ${input.title}, ${input.description}, ${input.categoryId}, ${input.serviceAreaId},
              ${startsAt}, ${endsAt}, ${input.headcount}, ${input.payRate}, ${input.engagementTypeId}, ${userId}, ${requestId})
      returning id
    `;
    await saveSkillsAndSite(tx, id, input, skillIds);
    return id;
  });
}

export function updateJob(userId: string, jobId: string, input: JobInput, skillIds: string[]) {
  return withUser(userId, async (tx) => {
    const { startsAt, endsAt } = times(tx, input);
    // Writing an unchanged start time is not a change: the database only
    // re-checks time rules when a value differs.
    const result = await tx`
      update public.jobs set
        title = ${input.title},
        description = ${input.description},
        category_id = ${input.categoryId},
        service_area_id = ${input.serviceAreaId},
        starts_at = ${startsAt},
        ends_at = ${endsAt},
        headcount = ${input.headcount},
        pay_rate_cents = ${input.payRate},
        engagement_type_id = ${input.engagementTypeId}
      where id = ${jobId}
    `;
    if (result.count !== 1) throw new Error("Job not found or not editable.");
    await saveSkillsAndSite(tx, jobId, input, skillIds);
  });
}

export type JobFilter = "upcoming" | "past" | "all";

export function listOrganizationJobs(userId: string, orgId: string, filter: JobFilter) {
  return withUser(userId, (tx) => tx<Job[]>`
    select ${jobColumns(tx)}
    from ${jobFrom(tx)}
    where j.organization_id = ${orgId}
      and (${filter} = 'all'
           or (${filter} = 'upcoming' and j.status in ('open', 'filled'))
           or (${filter} = 'past' and j.status in ('completed', 'cancelled')))
    order by case when ${filter} = 'past' then null else j.starts_at end asc nulls last, j.starts_at desc
    limit 200
  `);
}

export async function getJob(userId: string, jobId: string): Promise<Job | null> {
  const rows = await withUser(userId, (tx) => tx<Job[]>`
    select ${jobColumns(tx)} from ${jobFrom(tx)} where j.id = ${jobId}
  `);
  return rows[0] ?? null;
}

/** The site is only readable by the business, staff and workers who accepted. */
export async function getJobSite(userId: string, jobId: string): Promise<JobSite | null> {
  const rows = await withUser(userId, (tx) => tx<JobSite[]>`
    select address_line1, city, postal_code, site_notes, contact_name, contact_phone
    from public.job_sites where job_id = ${jobId}
  `);
  return rows[0] ?? null;
}

export type JobPerson = {
  worker_user_id: string;
  full_name: string;
  headline: string;
  years_experience: number | null;
  home_area_name: string | null;
  has_vehicle: boolean;
  has_drivers_license: boolean;
  skill_names: string[];
  matching_skills: number;
  application_id: string | null;
  application_status: ApplicationStatus | null;
  application_note: string | null;
  applied_at: Date | null;
  assignment_id: string | null;
  assignment_status: AssignmentStatus | null;
  offered_at: Date | null;
  responded_at: Date | null;
  cancel_reason: string | null;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
  phone: string | null;
};

export function listJobPeople(userId: string, jobId: string) {
  return withUser(userId, (tx) => tx<JobPerson[]>`select * from public.job_people(${jobId})`);
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------

export type WorkerJob = Job & {
  in_my_areas: boolean;
  matching_skills: number;
  application_id: string | null;
  application_status: ApplicationStatus | null;
  assignment_id: string | null;
  assignment_status: AssignmentStatus | null;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
};

function workerColumns(tx: Tx, userId: string) {
  return tx`
    (j.service_area_id in (select service_area_id from public.worker_service_areas where user_id = ${userId})
     or j.service_area_id = (select home_service_area_id from public.worker_profiles where user_id = ${userId})) as in_my_areas,
    (select count(*)::int from public.job_skills js join public.worker_skills ws on ws.skill_id = js.skill_id
      where js.job_id = j.id and ws.user_id = ${userId}) as matching_skills,
    ap.id as application_id, ap.status as application_status,
    asg.id as assignment_id, asg.status as assignment_status, asg.checked_in_at, asg.checked_out_at
  `;
}

function workerJoins(tx: Tx, userId: string) {
  return tx`
    left join public.job_applications ap on ap.job_id = j.id and ap.worker_user_id = ${userId}
    left join public.job_assignments asg on asg.job_id = j.id and asg.worker_user_id = ${userId}
  `;
}

/** Open jobs that have not started. `local` limits them to the worker's home and preferred towns. */
export function listOpenJobsForWorker(userId: string, scope: "local" | "all") {
  return withUser(userId, (tx) => tx<WorkerJob[]>`
    select * from (
      select ${jobColumns(tx)}, ${workerColumns(tx, userId)}
      from ${jobFrom(tx)} ${workerJoins(tx, userId)}
      where j.status = 'open' and j.starts_at > now()
    ) jobs
    where ${scope} = 'all' or in_my_areas
    order by starts_at
    limit 200
  `);
}

export async function getJobForWorker(userId: string, jobId: string): Promise<WorkerJob | null> {
  const rows = await withUser(userId, (tx) => tx<WorkerJob[]>`
    select ${jobColumns(tx)}, ${workerColumns(tx, userId)}
    from ${jobFrom(tx)} ${workerJoins(tx, userId)}
    where j.id = ${jobId}
  `);
  return rows[0] ?? null;
}

/** Jobs the worker applied to or was offered, most relevant first. */
export function listMyWork(userId: string) {
  return withUser(userId, (tx) => tx<WorkerJob[]>`
    select ${jobColumns(tx)}, ${workerColumns(tx, userId)}
    from ${jobFrom(tx)} ${workerJoins(tx, userId)}
    where ap.id is not null or asg.id is not null
    order by
      case
        when asg.status = 'offered' then 0
        when asg.status = 'accepted' then 1
        when ap.status = 'applied' then 2
        else 3
      end,
      case when j.status in ('open', 'filled') then j.starts_at end asc nulls last,
      j.starts_at desc
    limit 200
  `);
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export async function applyToJob(userId: string, jobId: string, note: string) {
  await withUser(userId, (tx) => tx`select public.apply_to_job(${jobId}, ${note})`);
}

export async function withdrawApplication(userId: string, applicationId: string) {
  await withUser(userId, (tx) => tx`select public.withdraw_application(${applicationId})`);
}

export async function declineApplication(userId: string, applicationId: string, note: string) {
  await withUser(userId, (tx) => tx`select public.decline_application(${applicationId}, ${note})`);
}

export async function offerJob(userId: string, jobId: string, workerUserId: string) {
  await withUser(userId, (tx) => tx`select public.offer_job(${jobId}, ${workerUserId})`);
}

export async function respondToOffer(userId: string, assignmentId: string, accept: boolean) {
  await withUser(userId, (tx) => tx`select public.respond_to_offer(${assignmentId}, ${accept})`);
}

export async function cancelAssignment(userId: string, assignmentId: string, reason: string) {
  await withUser(userId, (tx) => tx`select public.cancel_assignment(${assignmentId}, ${reason})`);
}

export async function cancelJob(userId: string, jobId: string, reason: string) {
  await withUser(userId, (tx) => tx`select public.cancel_job(${jobId}, ${reason})`);
}

export async function completeJob(userId: string, jobId: string) {
  await withUser(userId, (tx) => tx`select public.complete_job(${jobId})`);
}

export async function checkIn(userId: string, assignmentId: string) {
  await withUser(userId, (tx) => tx`select public.check_in(${assignmentId})`);
}

export async function checkOut(userId: string, assignmentId: string) {
  await withUser(userId, (tx) => tx`select public.check_out(${assignmentId})`);
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export type AdminJobFilter = "attention" | "open" | "filled" | "completed" | "cancelled" | "all";

/**
 * Jobs across all contractors. "attention" = open jobs starting within 48
 * hours that are not yet filled, the ones staff should help match.
 */
export function listJobsForAdmin(adminId: string, filter: AdminJobFilter) {
  return withUser(adminId, (tx) => tx<(Job & { business_name: string })[]>`
    select ${jobColumns(tx)}, o.name as business_name
    from ${jobFrom(tx)} join public.organizations o on o.id = j.organization_id
    where case ${filter}
      when 'attention' then j.status = 'open' and j.starts_at > now() and j.starts_at < now() + interval '48 hours'
      when 'all' then true
      else j.status::text = ${filter}
    end
    order by case when j.status in ('open', 'filled') then j.starts_at end asc nulls last, j.starts_at desc
    limit 200
  `);
}

export type JobCounts = { open_jobs: number; unfilled_soon: number; filled_upcoming: number; completed_30d: number };

export async function getJobCountsForAdmin(adminId: string): Promise<JobCounts> {
  const [row] = await withUser(adminId, (tx) => tx<JobCounts[]>`
    select
      (select count(*) from public.jobs where status = 'open' and starts_at > now())::int as open_jobs,
      (select count(*) from public.jobs
        where status = 'open' and starts_at > now() and starts_at < now() + interval '48 hours')::int as unfilled_soon,
      (select count(*) from public.jobs where status = 'filled' and starts_at > now())::int as filled_upcoming,
      (select count(*) from public.jobs where status = 'completed' and completed_at > now() - interval '30 days')::int as completed_30d
  `);
  return row;
}

export type MatchCandidate = {
  user_id: string;
  full_name: string;
  headline: string;
  home_area_name: string | null;
  in_area: boolean;
  matching_skills: number;
  already_involved: boolean;
};

/** Approved workers ranked for a job, for staff matching by hand. */
export function listMatchCandidates(adminId: string, jobId: string) {
  return withUser(adminId, (tx) => tx<MatchCandidate[]>`
    select w.user_id, p.full_name, w.headline, ha.name as home_area_name,
           (j.service_area_id = w.home_service_area_id
            or exists (select 1 from public.worker_service_areas wa where wa.user_id = w.user_id and wa.service_area_id = j.service_area_id)) as in_area,
           (select count(*)::int from public.worker_skills ws join public.job_skills js on js.skill_id = ws.skill_id
             where ws.user_id = w.user_id and js.job_id = j.id) as matching_skills,
           exists (select 1 from public.job_assignments x where x.job_id = j.id and x.worker_user_id = w.user_id) as already_involved
    from public.jobs j
    cross join public.worker_profiles w
    join public.profiles p on p.id = w.user_id
    left join public.service_areas ha on ha.id = w.home_service_area_id
    where j.id = ${jobId} and w.status = 'approved'
    order by in_area desc, matching_skills desc, p.full_name
    limit 50
  `);
}

/** The lowest hourly pay a job in this market may offer, if one is set. */
export async function getMarketMinPay(userId: string, marketId: string): Promise<number | null> {
  const [row] = await withUser(userId, (tx) => tx<{ min_hourly_pay_cents: number | null }[]>`
    select min_hourly_pay_cents from public.markets where id = ${marketId}
  `);
  return row?.min_hourly_pay_cents ?? null;
}
