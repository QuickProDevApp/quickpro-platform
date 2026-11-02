import { ApplicationStatusBadge, AssignmentStatusBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ActionForm, Input, SubmitButton } from "@/components/ui/form";
import { formatDateTime } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { JobPerson } from "@/server/data/jobs";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Crew and applicants for a job. Actions are passed in by the page, so the
 * same list serves the contractor and staff; a missing action hides its button.
 */
export function JobPeople({
  people,
  canOffer,
  canChange,
  offerAction,
  declineAction,
  cancelAction,
  skillsRequested,
}: {
  people: JobPerson[];
  /** How many skills the job asks for, to describe each person's match. */
  skillsRequested: number;
  /** The job is open and has not started. */
  canOffer: boolean;
  /** The job is open or filled and has not ended. */
  canChange: boolean;
  offerAction?: Action;
  declineAction?: Action;
  cancelAction?: Action;
}) {
  const booked = people.filter((p) => p.assignment_status === "accepted" || p.assignment_status === "completed");
  const offered = people.filter((p) => p.assignment_status === "offered");
  const applicants = people.filter((p) => !p.assignment_status && p.application_status === "applied");
  const others = people.filter((p) => !booked.includes(p) && !offered.includes(p) && !applicants.includes(p));

  const row = (p: JobPerson, children?: React.ReactNode) => (
    <PersonRow key={p.worker_user_id} person={p} skillsRequested={skillsRequested}>
      {children}
    </PersonRow>
  );

  return (
    <Card>
      <CardHeader title="People" description="Approved QuickPro workers who applied, were offered the job, or are booked." />
      <Section title={`Booked (${booked.length})`} note="Phone numbers are shared once a worker accepts.">
        {booked.length === 0 ? (
          <p className="text-sm text-muted">Nobody has accepted yet.</p>
        ) : (
          booked.map((p) =>
            row(
              p,
              <>
                <p className="text-[13px] text-ink-soft">
                  {p.phone ? (
                    <a href={`tel:${p.phone}`} className="tabular font-medium text-brand hover:underline">
                      {p.phone}
                    </a>
                  ) : null}
                  <span className="text-muted">
                    {p.phone ? " · " : ""}
                    {p.checked_in_at ? `Checked in ${formatDateTime(p.checked_in_at)}` : "Not checked in"}
                    {p.checked_out_at ? ` · Checked out ${formatDateTime(p.checked_out_at)}` : ""}
                  </span>
                </p>
                {canChange && cancelAction && p.assignment_status === "accepted" ? (
                  <CancelForm action={cancelAction} assignmentId={p.assignment_id!} />
                ) : null}
              </>,
            ),
          )
        )}
      </Section>

      {offered.length ? (
        <Section title={`Offered (${offered.length})`} note="Waiting for the worker to accept or decline.">
          {offered.map((p) =>
            row(
              p,
              <>
                <p className="text-[13px] text-muted">Offered {formatDateTime(p.offered_at)}</p>
                {canChange && cancelAction ? <CancelForm action={cancelAction} assignmentId={p.assignment_id!} label="Withdraw offer" /> : null}
              </>,
            ),
          )}
        </Section>
      ) : null}

      <Section title={`Applicants (${applicants.length})`}>
        {applicants.length === 0 ? (
          <p className="text-sm text-muted">No new applicants.</p>
        ) : (
          applicants.map((p) =>
            row(
              p,
              <>
                {p.application_note ? (
                  <p className="border-l-2 border-line-strong pl-3 text-sm text-ink-soft">{p.application_note}</p>
                ) : null}
                <p className="text-[13px] text-muted">Applied {formatDateTime(p.applied_at)}</p>
                {canOffer ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {offerAction ? (
                      <ActionForm action={offerAction} className="contents">
                        <input type="hidden" name="workerId" value={p.worker_user_id} />
                        <SubmitButton size="sm" pendingLabel="Offering…">
                          Offer the job
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                    {declineAction ? (
                      <ActionForm action={declineAction} className="contents">
                        <input type="hidden" name="applicationId" value={p.application_id!} />
                        <SubmitButton size="sm" variant="secondary" pendingLabel="Declining…">
                          Decline
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </div>
                ) : null}
              </>,
            ),
          )
        )}
      </Section>

      {others.length ? (
        <Section title="Earlier" note="Declined, withdrawn and cancelled.">
          {others.map((p) => row(p, p.cancel_reason ? <p className="text-[13px] text-muted">Reason: {p.cancel_reason}</p> : null))}
        </Section>
      ) : null}
    </Card>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line first-of-type:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-2 bg-subtle/50 px-4 py-2 sm:px-5">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {note ? <p className="text-xs text-muted">{note}</p> : null}
      </div>
      <ul className="divide-y divide-line px-4 sm:px-5">{children}</ul>
    </section>
  );
}

function PersonRow({ person: p, skillsRequested, children }: { person: JobPerson; skillsRequested: number; children?: React.ReactNode }) {
  const match =
    skillsRequested === 0
      ? null
      : p.matching_skills === skillsRequested
        ? "Has every skill you asked for"
        : p.matching_skills > 0
          ? `Has ${p.matching_skills} of ${skillsRequested} skills you asked for`
          : "None of the skills you asked for";
  return (
    <li className="space-y-1.5 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{p.full_name || "Unnamed worker"}</p>
          <p className="text-[13px] text-muted">
            {[p.headline, p.home_area_name, p.years_experience != null ? `${p.years_experience} yrs experience` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {p.assignment_status ? (
          <AssignmentStatusBadge status={p.assignment_status} />
        ) : p.application_status ? (
          <ApplicationStatusBadge status={p.application_status} />
        ) : null}
      </div>
      <p className="text-[13px] text-muted">
        {[
          match,
          p.skill_names.length ? `Skills: ${p.skill_names.join(", ")}` : null,
          p.has_vehicle ? "Has a vehicle" : null,
          p.has_drivers_license ? "Driver's license" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {children}
    </li>
  );
}

function CancelForm({ action, assignmentId, label = "Cancel assignment" }: { action: Action; assignmentId: string; label?: string }) {
  return (
    <details className="pt-1">
      <summary className="inline-flex cursor-pointer list-none items-center text-[13px] font-medium text-bad hover:underline">{label}…</summary>
      <ActionForm action={action} className="mt-2 flex flex-wrap items-start gap-2">
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <div className="min-w-48 flex-1">
          <Input name="reason" placeholder="Reason (the worker will see it)" aria-label="Reason" required maxLength={1000} />
        </div>
        <SubmitButton size="sm" variant="danger" pendingLabel="Cancelling…">
          {label}
        </SubmitButton>
      </ActionForm>
    </details>
  );
}
