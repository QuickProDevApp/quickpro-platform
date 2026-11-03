import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { formatCents } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import { formatDayHeading } from "@/lib/schedule";
import { formatHours, grossCents, localInputValue, minutesBetween } from "@/lib/timesheets";
import type { OrgTimesheetRow, TimesheetStatus, WorkerTimesheetRow } from "@/server/data/timesheets";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const span = (a: Date, b: Date) => `${clock.format(a)} – ${clock.format(b)}`;

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus | null }) {
  if (status === "approved") {
    return (
      <Badge dot tone="ok">
        Approved
      </Badge>
    );
  }
  if (status === "queried") {
    return (
      <Badge dot tone="bad">
        Questioned
      </Badge>
    );
  }
  return (
    <Badge dot tone="warn">
      Needs approval
    </Badge>
  );
}

/** Rows grouped under a heading per day, in order. */
function byDay<T extends { local_date: string }>(rows: T[]) {
  const days = new Map<string, T[]>();
  for (const r of rows) days.set(r.local_date, [...(days.get(r.local_date) ?? []), r]);
  return [...days.entries()];
}

function Recorded({ row }: { row: { checked_in_at: Date | null; checked_out_at: Date | null } }) {
  if (!row.checked_in_at) return <>No check-in recorded</>;
  if (!row.checked_out_at) return <>Checked in {clock.format(row.checked_in_at)}, no check-out</>;
  return (
    <>
      Checked in {clock.format(row.checked_in_at)} · out {clock.format(row.checked_out_at)} (
      {formatHours(minutesBetween(row.checked_in_at, row.checked_out_at))})
    </>
  );
}

function ApprovedLine({
  row,
}: {
  row: { worked_minutes: number | null; break_minutes: number | null; pay_rate_cents: number; started_at: Date | null; ended_at: Date | null };
}) {
  if (row.worked_minutes == null || !row.started_at || !row.ended_at) return null;
  return (
    <>
      <span className="font-medium text-ink">{formatHours(row.worked_minutes)}</span> · {span(row.started_at, row.ended_at)}
      {row.break_minutes ? ` · ${row.break_minutes} min break` : ""} · {formatCents(row.pay_rate_cents)}/h ·{" "}
      <span className="font-medium text-ink">≈ {formatCents(grossCents(row.worked_minutes, row.pay_rate_cents))}</span>
    </>
  );
}

/**
 * A business's shifts for the week with their hours. Dispatchers approve
 * them as recorded or adjust them with a note for the worker.
 */
export function OrgTimesheetList({
  rows,
  canApprove,
  approveAction,
  jobHref,
}: {
  rows: OrgTimesheetRow[];
  canApprove: boolean;
  approveAction: Action;
  jobHref: (jobId: string) => string;
}) {
  if (!rows.length) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No finished shifts this week">
            Booked shifts appear here once they end or the worker checks out.
          </EmptyState>
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {byDay(rows).map(([date, dayRows]) => (
        <Card key={date}>
          <div className="border-b border-line bg-subtle/50 px-4 py-2 sm:px-5">
            <h3 className="text-[13px] font-semibold text-ink">{formatDayHeading(date)}</h3>
          </div>
          <ul className="divide-y divide-line">
            {dayRows.map((r) => {
              const recorded =
                r.checked_in_at && r.checked_out_at ? minutesBetween(r.checked_in_at, r.checked_out_at) : null;
              const start = r.started_at ?? r.checked_in_at ?? r.scheduled_start;
              const end = r.ended_at ?? r.checked_out_at ?? r.scheduled_end;
              return (
                <li
                  key={r.assignment_id}
                  className="space-y-2 px-4 py-3.5 sm:px-5"
                  data-testid="timesheet-row"
                  data-status={r.status ?? "pending"}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{r.worker_name}</p>
                      <p className="text-[13px] text-muted">
                        <Link href={jobHref(r.job_id)} className="hover:text-ink hover:underline">
                          {r.job_title}
                        </Link>{" "}
                        · scheduled {span(r.scheduled_start, r.scheduled_end)}
                      </p>
                    </div>
                    <TimesheetStatusBadge status={r.status} />
                  </div>
                  <p className="tabular text-[13px] text-ink-soft">
                    <Recorded row={r} />
                  </p>
                  {r.status ? (
                    <p className="tabular text-[13px] text-ink-soft" data-testid="timesheet-approved">
                      {r.status === "queried" ? "Last approved" : "Approved"}: <ApprovedLine row={r} />
                    </p>
                  ) : null}
                  {r.adjust_note ? <p className="text-[13px] text-muted">Your note: “{r.adjust_note}”</p> : null}
                  {r.status === "queried" && r.query_note ? (
                    <p className="rounded-md bg-bad/5 px-3 py-2 text-[13px] text-ink ring-1 ring-bad/20 ring-inset">
                      <span className="font-medium">{r.worker_name} questioned these hours:</span> “{r.query_note}”
                    </p>
                  ) : null}
                  {canApprove ? (
                    <div className="flex flex-wrap items-start gap-2">
                      {!r.status && recorded != null && recorded > 0 && r.checked_in_at && r.checked_out_at ? (
                        <ActionForm action={approveAction} className="min-w-0" successMessage={false}>
                          <input type="hidden" name="assignmentId" value={r.assignment_id} />
                          <input type="hidden" name="start" value={localInputValue(r.checked_in_at)} />
                          <input type="hidden" name="end" value={localInputValue(r.checked_out_at)} />
                          <input type="hidden" name="breakMinutes" value="0" />
                          <SubmitButton size="sm" pendingLabel="Approving…">
                            Approve {formatHours(recorded)} as recorded
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                      <details className="group min-w-0 flex-1 basis-60" open={r.status === "queried"}>
                        <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md px-2.5 text-[13px] font-medium text-ink-soft ring-1 ring-line ring-inset hover:bg-subtle">
                          {r.status ? "Change hours…" : "Adjust and approve…"}
                        </summary>
                        <ActionForm action={approveAction} className="mt-3 space-y-3">
                          <input type="hidden" name="assignmentId" value={r.assignment_id} />
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field name="start" id={`start-${r.assignment_id}`} label="Start">
                              <Input
                                id={`start-${r.assignment_id}`}
                                name="start"
                                type="datetime-local"
                                defaultValue={localInputValue(start)}
                                required
                              />
                            </Field>
                            <Field name="end" id={`end-${r.assignment_id}`} label="End">
                              <Input
                                id={`end-${r.assignment_id}`}
                                name="end"
                                type="datetime-local"
                                defaultValue={localInputValue(end)}
                                required
                              />
                            </Field>
                            <Field name="breakMinutes" id={`break-${r.assignment_id}`} label="Unpaid break (min)">
                              <Input
                                id={`break-${r.assignment_id}`}
                                name="breakMinutes"
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={600}
                                defaultValue={r.break_minutes ?? 0}
                              />
                            </Field>
                          </div>
                          <Field
                            name="note"
                            id={`note-${r.assignment_id}`}
                            label="Note for the worker"
                            hint="Needed when the times differ from their check-in and check-out."
                          >
                            <Input
                              id={`note-${r.assignment_id}`}
                              name="note"
                              maxLength={500}
                              defaultValue={r.adjust_note ?? ""}
                              placeholder="For example: Left early for the second site"
                            />
                          </Field>
                          <SubmitButton size="sm" variant="secondary" pendingLabel="Approving…">
                            Approve hours
                          </SubmitButton>
                        </ActionForm>
                      </details>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** A worker's finished shifts for the week, with approved hours and an estimate of gross pay. */
export function WorkerTimesheetList({ rows, queryAction }: { rows: WorkerTimesheetRow[]; queryAction: Action }) {
  if (!rows.length) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No finished shifts this week">
            Your shifts appear here once they end, with the hours the business approves.
          </EmptyState>
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {byDay(rows).map(([date, dayRows]) => (
        <Card key={date}>
          <div className="border-b border-line bg-subtle/50 px-4 py-2 sm:px-5">
            <h3 className="text-[13px] font-semibold text-ink">{formatDayHeading(date)}</h3>
          </div>
          <ul className="divide-y divide-line">
            {dayRows.map((r) => (
              <li
                key={r.assignment_id}
                className="space-y-2 px-4 py-3.5 sm:px-5"
                data-testid="timesheet-row"
                data-status={r.status ?? "pending"}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/app/worker/jobs/${r.job_id}`} className="font-medium text-ink hover:underline">
                      {r.job_title}
                    </Link>
                    <p className="text-[13px] text-muted">
                      {r.organization_name ?? "Contractor"} · scheduled {span(r.scheduled_start, r.scheduled_end)}
                    </p>
                  </div>
                  <TimesheetStatusBadge status={r.status} />
                </div>
                <p className="tabular text-[13px] text-ink-soft">
                  <Recorded row={r} />
                </p>
                {r.status ? (
                  <p className="tabular text-[13px] text-ink-soft" data-testid="timesheet-approved">
                    {r.status === "queried" ? "Last approved" : "Approved"}: <ApprovedLine row={r} />
                  </p>
                ) : (
                  <p className="text-[13px] text-muted">Waiting for the business to approve your hours.</p>
                )}
                {r.adjust_note ? (
                  <p className="text-[13px] text-muted">Note from the business: “{r.adjust_note}”</p>
                ) : null}
                {r.status === "queried" ? (
                  <p className="text-[13px] text-muted">
                    You questioned these hours: “{r.query_note}” The business has been told.
                  </p>
                ) : null}
                {r.status === "approved" ? (
                  <details className="group">
                    <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md px-2.5 text-[13px] font-medium text-ink-soft ring-1 ring-line ring-inset hover:bg-subtle">
                      Question these hours…
                    </summary>
                    <ActionForm action={queryAction} className="mt-3 space-y-3">
                      <input type="hidden" name="assignmentId" value={r.assignment_id} />
                      <Field name="note" id={`query-${r.assignment_id}`} label="What's wrong">
                        <Textarea
                          id={`query-${r.assignment_id}`}
                          name="note"
                          rows={2}
                          maxLength={1000}
                          required
                          placeholder="For example: I worked through my break"
                        />
                      </Field>
                      <SubmitButton size="sm" variant="secondary" pendingLabel="Sending…">
                        Send to the business
                      </SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export function timesheetTotals(rows: { status: TimesheetStatus | null; worked_minutes: number | null; pay_rate_cents: number }[]) {
  const approved = rows.filter((r) => r.status === "approved" && r.worked_minutes != null);
  const minutes = approved.reduce((n, r) => n + (r.worked_minutes ?? 0), 0);
  const cents = approved.reduce((n, r) => n + grossCents(r.worked_minutes ?? 0, r.pay_rate_cents), 0);
  return {
    pending: rows.filter((r) => !r.status).length,
    queried: rows.filter((r) => r.status === "queried").length,
    minutes,
    cents,
  };
}
