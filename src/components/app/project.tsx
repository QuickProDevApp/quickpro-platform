import Link from "next/link";
import { Badge, JobStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { formatDateTime, formatShift } from "@/lib/labels";
import type { SharedJobPhoto } from "@/server/data/job-photos";
import type {
  ProjectAttendance,
  ProjectChecklistItem,
  ProjectEvent,
  ProjectJob,
  ServiceRequest,
} from "@/server/data/requests";

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

type Stage = { key: string; label: string; done: boolean; current: boolean };

/** Where an awarded project stands, from the award to the customer's confirmation. */
export function projectStages(request: ServiceRequest, jobs: ProjectJob[]): Stage[] {
  const scheduled = jobs.some((j) => j.status !== "cancelled");
  const started = jobs.some((j) => j.checked_in > 0 || j.status === "completed");
  const reported = request.work_completed_at !== null || request.status === "completed";
  const confirmed = request.status === "completed";
  const flags = [true, scheduled, started, reported, confirmed];
  const labels = ["Awarded", "Jobs scheduled", "Work under way", "Reported complete", "Confirmed"];
  const firstOpen = flags.indexOf(false);
  return labels.map((label, i) => ({ key: label, label, done: flags[i], current: i === firstOpen }));
}

export function ProjectProgress({ stages }: { stages: Stage[] }) {
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Project progress">
      {stages.map((s) => (
        <li key={s.key} className="min-w-0" aria-current={s.current ? "step" : undefined}>
          <span
            aria-hidden
            className={`block h-1 rounded-full ${s.done ? "bg-navy" : s.current ? "bg-signal" : "bg-line"}`}
          />
          <span
            className={`mt-1.5 block text-[11px] leading-tight break-words hyphens-auto sm:text-xs ${
              s.done ? "font-medium text-ink" : s.current ? "font-medium text-signal-ink" : "text-muted"
            }`}
          >
            <span className="sr-only">{s.done ? "Done: " : s.current ? "Next: " : "Later: "}</span>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The project's jobs with staffing and attendance. The contractor gets links
 * to manage each job; the customer sees who is booked and when they checked
 * in and out, but not workers' contact details.
 */
export function ProjectJobs({
  jobs,
  attendance,
  jobHref,
  action,
  emptyText,
  primeId,
  checklists,
}: {
  jobs: ProjectJob[];
  /** Each job's checklist, labels and done state only (D-036). */
  checklists?: ProjectChecklistItem[];
  /** The awarded contractor: jobs run by anyone else (subcontractors) are labelled with their business. */
  primeId?: string | null;
  attendance: ProjectAttendance[];
  jobHref?: (jobId: string) => string | undefined;
  action?: React.ReactNode;
  emptyText: string;
}) {
  const active = jobs.filter((j) => j.status !== "cancelled");

  const booked = active.reduce((n, j) => n + j.booked, 0);
  const needed = active.reduce((n, j) => n + j.headcount, 0);
  return (
    <Card>
      <CardHeader
        title={`Work (${jobs.length} ${jobs.length === 1 ? "job" : "jobs"})`}
        description={jobs.length ? `${booked} of ${needed} spots booked across active jobs.` : undefined}
        action={action}
      />
      {jobs.length === 0 ? (
        <CardBody>
          <EmptyState title="No jobs scheduled yet">{emptyText}</EmptyState>
        </CardBody>
      ) : (
        <ul className="divide-y divide-line">
          {jobs.map((j) => {
            const crew = attendance.filter((a) => a.job_id === j.id);
            const items = checklists?.filter((c) => c.job_id === j.id) ?? [];
            const href = jobHref?.(j.id);
            return (
              <li key={j.id} className="px-4 py-3.5 sm:px-5" data-testid="project-job">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    {href ? (
                      <Link href={href} className="font-medium text-ink hover:text-brand hover:underline">
                        {j.title}
                      </Link>
                    ) : (
                      <p className="font-medium text-ink">{j.title}</p>
                    )}
                    <p className="tabular text-[13px] text-muted">
                      {formatShift(j.starts_at, j.ends_at)}
                      {primeId && j.organization_id !== primeId ? (
                        <span className="font-sans"> · {j.organization_name}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular text-[13px] text-ink-soft">
                      {j.booked}/{j.headcount} booked
                    </span>
                    <JobStatusBadge job={j} />
                  </div>
                </div>
                {crew.length ? (
                  <table className="mt-2.5 w-full table-fixed text-[13px]">
                    <caption className="sr-only">Attendance for {j.title}</caption>
                    <thead className="text-left text-[11px] tracking-wide text-faint uppercase">
                      <tr>
                        <th className="w-1/2 pb-1 font-medium">Worker</th>
                        <th className="w-1/4 pb-1 font-medium">In</th>
                        <th className="w-1/4 pb-1 font-medium">Out</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {crew.map((a, i) => (
                        <tr key={`${a.job_id}-${i}`} className="border-t border-line/70" data-testid="attendance-row">
                          <td className="truncate py-1.5 pr-2 text-ink">{a.worker_name}</td>
                          <td className="py-1.5 pr-2 text-ink-soft">
                            {a.checked_in_at ? clock.format(a.checked_in_at) : "—"}
                          </td>
                          <td className="py-1.5 text-ink-soft">
                            {a.checked_out_at ? clock.format(a.checked_out_at) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                {items.length ? <JobChecklistProgress title={j.title} items={items} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Tick({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
        done ? "border-ok bg-ok text-white" : "border-line-strong bg-surface"
      }`}
    >
      {done ? (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

/** A job's checklist as the customer sees it: progress, then the items on demand. */
function JobChecklistProgress({ title, items }: { title: string; items: ProjectChecklistItem[] }) {
  const done = items.filter((i) => i.done_at).length;
  const pct = Math.round((done / items.length) * 100);
  return (
    <details
      className="group mt-2.5 rounded-md border border-line/80 bg-subtle/50"
      data-testid="project-checklist"
      data-done={done}
      data-total={items.length}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-[13px] [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-ink">Checklist</span>
        <span
          className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label={`Checklist progress for ${title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span className="block h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
        </span>
        <span className="tabular shrink-0 text-ink-soft">
          {done} of {items.length} done
        </span>
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <ul className="space-y-1.5 border-t border-line/80 px-3 py-2.5">
        {items.map((i) => (
          <li key={i.item_id} className="flex items-start gap-2 text-[13px]">
            <Tick done={!!i.done_at} />
            <span className="sr-only">{i.done_at ? "Done:" : "Not done:"}</span>
            <span className={i.done_at ? "text-muted line-through decoration-line-strong" : "text-ink"}>{i.label}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

const photoDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

/** Photos the contractor shared from the site, newest first. */
export function ProjectPhotos({
  photos,
  contractorName,
  description,
  emptyText,
}: {
  photos: SharedJobPhoto[];
  contractorName: string;
  description?: string;
  emptyText?: string;
}) {
  const ordered = [...photos].reverse();
  return (
    <Card>
      <CardHeader
        title="Photos from the site"
        description={description ?? `${contractorName} chooses which photos to share with you.`}
        action={
          photos.length ? (
            <span className="tabular text-[13px] font-medium text-ink-soft">
              {photos.length} {photos.length === 1 ? "photo" : "photos"}
            </span>
          ) : null
        }
      />
      <CardBody>
        {ordered.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ordered.map((p) => {
              const label = p.caption ?? p.checklist_label ?? p.job_title;
              return (
                <li key={p.id} className="min-w-0" data-testid="project-photo">
                  <a
                    href={`/api/job-photos/${p.id}`}
                    target="_blank"
                    rel="noopener"
                    className="block overflow-hidden rounded-md border border-line bg-subtle focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private files served by an authorized route */}
                    <img
                      src={`/api/job-photos/${p.id}`}
                      alt={label}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  </a>
                  <div className="mt-1.5 space-y-0.5 text-xs">
                    {p.caption ? <p className="line-clamp-2 text-ink">{p.caption}</p> : null}
                    {p.checklist_label ? <p className="line-clamp-1 text-ink-soft">For: {p.checklist_label}</p> : null}
                    <p className="line-clamp-1 text-muted">
                      {p.job_title} · {photoDate.format(p.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No photos shared yet">
            {emptyText ?? `When ${contractorName} shares photos of the work, they appear here.`}
          </EmptyState>
        )}
      </CardBody>
    </Card>
  );
}

const EVENT_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = {
  "request.awarded": "ok",
  "request.completed": "ok",
  "request.cancelled": "bad",
  "work.reported": "info",
  "work.reopened": "warn",
  "job.cancelled": "bad",
  "subcontract.accepted": "info",
  "subcontract.completed": "ok",
  "subcontract.cancelled": "bad",
  "dispute.opened": "warn",
  "dispute.resolved": "info",
};

/** The project's history, newest first. */
export function ProjectTimeline({ events }: { events: ProjectEvent[] }) {
  const ordered = [...events].reverse();
  return (
    <Card>
      <CardHeader title="History" />
      {ordered.length === 0 ? (
        <CardBody>
          <EmptyState title="Nothing yet" />
        </CardBody>
      ) : (
        <ol className="px-4 py-3 sm:px-5" aria-label="Project history">
          {ordered.map((e, i) => {
            const tone = EVENT_TONE[e.kind];
            return (
              <li key={e.id} className="relative pb-4 pl-5 last:pb-1" data-testid="history-event">
                {i < ordered.length - 1 ? (
                  <span aria-hidden className="absolute top-2.5 bottom-0 left-[3px] w-px bg-line" />
                ) : null}
                <span
                  aria-hidden
                  className={`absolute top-1.5 left-0 h-[7px] w-[7px] rounded-full ${
                    tone === "ok"
                      ? "bg-ok"
                      : tone === "warn"
                        ? "bg-warn"
                        : tone === "bad"
                          ? "bg-bad"
                          : tone === "info"
                            ? "bg-info"
                            : "bg-faint"
                  }`}
                />
                <p className="text-sm text-ink">{e.summary}</p>
                {e.detail ? <p className="mt-0.5 text-[13px] whitespace-pre-line text-ink-soft">{e.detail}</p> : null}
                <p className="mt-0.5 text-xs text-muted">
                  {formatDateTime(e.created_at)}
                  {e.actor_label ? ` · ${e.actor_label}` : ""}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** A small "awaiting your confirmation" style callout used at the top of a project. */
export function ProjectNotice({
  tone,
  title,
  children,
}: {
  tone: "info" | "warn" | "ok";
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 sm:px-5 ${
        tone === "warn"
          ? "border-warn/30 bg-warn-soft"
          : tone === "ok"
            ? "border-ok/25 bg-ok-soft"
            : "border-info/20 bg-info-soft"
      }`}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {tone === "warn" ? <Badge tone="warn">Action needed</Badge> : null}
      </div>
      {children ? <div className="mt-1 text-sm text-ink-soft">{children}</div> : null}
    </div>
  );
}
