import "server-only";
import { withUser } from "@/server/db/client";

// Timesheets (D-038). The business approves each shift's hours for its own
// payroll; the worker sees them and can question them. Every change is a
// database function.

export type TimesheetStatus = "approved" | "queried";

export type OrgTimesheetRow = {
  assignment_id: string;
  job_id: string;
  job_title: string;
  local_date: string;
  scheduled_start: Date;
  scheduled_end: Date;
  worker_user_id: string;
  worker_name: string;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
  pay_rate_cents: number;
  /** Null until the business approves the hours. */
  status: TimesheetStatus | null;
  started_at: Date | null;
  ended_at: Date | null;
  break_minutes: number | null;
  worked_minutes: number | null;
  adjust_note: string | null;
  query_note: string | null;
  approved_at: Date | null;
};

/** Shifts with hours to approve or approved, starting between two New York dates. */
export function listOrgTimesheets(userId: string, orgId: string, from: string, to: string) {
  return withUser(
    userId,
    (tx) => tx<OrgTimesheetRow[]>`
    select assignment_id, job_id, job_title, to_char(local_date, 'YYYY-MM-DD') as local_date, scheduled_start,
           scheduled_end, worker_user_id, worker_name, checked_in_at, checked_out_at, pay_rate_cents, status,
           started_at, ended_at, break_minutes, worked_minutes, adjust_note, query_note, approved_at
    from public.org_timesheets(${orgId}, ${from}::date, ${to}::date)
  `,
  );
}

export type WorkerTimesheetRow = {
  assignment_id: string;
  job_id: string;
  job_title: string;
  organization_name: string | null;
  local_date: string;
  scheduled_start: Date;
  scheduled_end: Date;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
  pay_rate_cents: number;
  status: TimesheetStatus | null;
  started_at: Date | null;
  ended_at: Date | null;
  break_minutes: number | null;
  worked_minutes: number | null;
  adjust_note: string | null;
  query_note: string | null;
  approved_at: Date | null;
};

/** The worker's own finished shifts in a week, with any approved hours. */
export function listMyTimesheets(userId: string, from: string, to: string) {
  return withUser(
    userId,
    (tx) => tx<WorkerTimesheetRow[]>`
    select a.id as assignment_id, j.id as job_id, j.title as job_title,
           public.contractor_display_name(j.organization_id) as organization_name,
           to_char((j.starts_at at time zone 'America/New_York')::date, 'YYYY-MM-DD') as local_date,
           j.starts_at as scheduled_start, j.ends_at as scheduled_end, a.checked_in_at, a.checked_out_at,
           coalesce(t.pay_rate_cents, j.pay_rate_cents) as pay_rate_cents, t.status, t.started_at, t.ended_at,
           t.break_minutes, t.worked_minutes, t.adjust_note, t.query_note, t.approved_at
    from public.job_assignments a
    join public.jobs j on j.id = a.job_id
    left join public.timesheets t on t.assignment_id = a.id
    where a.worker_user_id = ${userId}
      and a.status in ('accepted', 'completed')
      and j.status <> 'cancelled'
      and (j.ends_at <= now() or a.checked_out_at is not null or t.assignment_id is not null)
      and (j.starts_at at time zone 'America/New_York')::date between ${from}::date and ${to}::date
    order by j.starts_at, j.id
  `,
  );
}

/** Approve hours; `start` and `end` are New York wall-clock values (YYYY-MM-DDTHH:MM). */
export async function approveTimesheet(
  userId: string,
  input: { assignmentId: string; start: string; end: string; breakMinutes: number; note: string | null },
) {
  await withUser(
    userId,
    (tx) => tx`
    select public.approve_timesheet(
      ${input.assignmentId},
      ${input.start}::timestamp at time zone 'America/New_York',
      ${input.end}::timestamp at time zone 'America/New_York',
      ${input.breakMinutes}, ${input.note})
  `,
  );
}

export async function queryTimesheet(userId: string, assignmentId: string, note: string) {
  await withUser(userId, (tx) => tx`select public.query_timesheet(${assignmentId}, ${note})`);
}
