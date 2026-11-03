import "server-only";
import { withUser } from "@/server/db/client";
import type { AssignmentStatus, JobStatus } from "@/lib/labels";

// Week schedules (D-033). Nothing new in the database: these read jobs,
// shifts and availability through row level security and the existing
// job_people function, which only the business and staff can call.

export type CrewMember = {
  name: string;
  status: Extract<AssignmentStatus, "offered" | "accepted" | "completed">;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
};

export type ScheduledJob = {
  id: string;
  title: string;
  area_name: string;
  project_title: string | null;
  starts_at: Date;
  ends_at: Date;
  /** Calendar date the job starts, in New York. */
  local_date: string;
  status: JobStatus;
  headcount: number;
  booked: number;
  offered: number;
  applicants: number;
  crew: CrewMember[];
};

/**
 * A contractor's jobs starting in the week (New York dates, inclusive),
 * cancelled ones left out. Crew are the people booked or offered the shift.
 */
export function getContractorSchedule(userId: string, orgId: string, start: string, end: string) {
  return withUser(
    userId,
    (tx) => tx<ScheduledJob[]>`
    select j.id, j.title, a.name as area_name,
           (select sr.title from public.service_requests sr where sr.id = j.service_request_id) as project_title,
           j.starts_at, j.ends_at,
           to_char(j.starts_at at time zone 'America/New_York', 'YYYY-MM-DD') as local_date,
           j.status, j.headcount,
           (select count(*)::int from public.job_assignments x where x.job_id = j.id and x.status in ('accepted', 'completed')) as booked,
           (select count(*)::int from public.job_assignments x where x.job_id = j.id and x.status = 'offered') as offered,
           (select count(*)::int from public.job_applications x where x.job_id = j.id and x.status = 'applied') as applicants,
           coalesce((
             select json_agg(json_build_object('name', p.full_name, 'status', p.assignment_status,
                                               'checked_in_at', p.checked_in_at, 'checked_out_at', p.checked_out_at)
                             order by p.assignment_status = 'offered', p.full_name)
             from public.job_people(j.id) p
             where p.assignment_status in ('offered', 'accepted', 'completed')
           ), '[]') as crew
    from public.jobs j
    join public.service_areas a on a.id = j.service_area_id
    where j.organization_id = ${orgId}
      and (app.is_org_member(j.organization_id) or app.is_admin())
      and j.status <> 'cancelled'
      and (j.starts_at at time zone 'America/New_York')::date between ${start}::date and ${end}::date
    order by j.starts_at, j.title
  `,
  ).then((rows) =>
    rows.map((r) => ({
      ...r,
      crew: (
        r.crew as unknown as {
          name: string;
          status: CrewMember["status"];
          checked_in_at: string | null;
          checked_out_at: string | null;
        }[]
      ).map((c) => ({
        ...c,
        checked_in_at: c.checked_in_at ? new Date(c.checked_in_at) : null,
        checked_out_at: c.checked_out_at ? new Date(c.checked_out_at) : null,
      })),
    })),
  );
}

export type ScheduledShift = {
  job_id: string;
  assignment_id: string;
  title: string;
  organization_name: string | null;
  area_name: string;
  starts_at: Date;
  ends_at: Date;
  local_date: string;
  job_status: JobStatus;
  status: Extract<AssignmentStatus, "offered" | "accepted" | "completed">;
  pay_rate_cents: number;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
};

/**
 * The worker's shifts starting in the week: booked, worked, and offers still
 * waiting for an answer. Cancelled and declined ones are left out.
 */
export function getWorkerSchedule(userId: string, start: string, end: string) {
  return withUser(
    userId,
    (tx) => tx<ScheduledShift[]>`
    select j.id as job_id, s.id as assignment_id, j.title,
           public.contractor_display_name(j.organization_id) as organization_name,
           a.name as area_name, j.starts_at, j.ends_at,
           to_char(j.starts_at at time zone 'America/New_York', 'YYYY-MM-DD') as local_date,
           j.status as job_status, s.status, j.pay_rate_cents, s.checked_in_at, s.checked_out_at
    from public.job_assignments s
    join public.jobs j on j.id = s.job_id
    join public.service_areas a on a.id = j.service_area_id
    where s.worker_user_id = ${userId}
      and s.status in ('offered', 'accepted', 'completed')
      and j.status <> 'cancelled'
      and not (s.status = 'offered' and (j.status <> 'open' or j.starts_at <= now()))
      and (j.starts_at at time zone 'America/New_York')::date between ${start}::date and ${end}::date
    order by j.starts_at, j.title
  `,
  );
}

export type AvailabilityWindow = { weekday: number; start_time: string; end_time: string };

export function getMyAvailability(userId: string) {
  return withUser(
    userId,
    (tx) => tx<AvailabilityWindow[]>`
    select weekday::int, start_time::text, end_time::text
    from public.worker_availability where user_id = ${userId}
    order by weekday, start_time
  `,
  );
}

export type CalendarShift = {
  assignment_id: string;
  job_id: string;
  title: string;
  organization_name: string | null;
  area_name: string;
  starts_at: Date;
  ends_at: Date;
  address_line1: string | null;
  city: string | null;
  postal_code: string | null;
};

/** Booked shifts from today on (up to 90 days), for the calendar file. Site addresses are readable once booked. */
export function listBookedShiftsForCalendar(userId: string) {
  return withUser(
    userId,
    (tx) => tx<CalendarShift[]>`
    select s.id as assignment_id, j.id as job_id, j.title, public.contractor_display_name(j.organization_id) as organization_name,
           a.name as area_name, j.starts_at, j.ends_at, site.address_line1, site.city, site.postal_code
    from public.job_assignments s
    join public.jobs j on j.id = s.job_id
    join public.service_areas a on a.id = j.service_area_id
    left join public.job_sites site on site.job_id = j.id
    where s.worker_user_id = ${userId}
      and s.status = 'accepted'
      and j.status in ('open', 'filled')
      and j.ends_at > now()
      and j.starts_at < now() + interval '90 days'
    order by j.starts_at
    limit 200
  `,
  );
}
