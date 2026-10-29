import { ApplicationStatusBadge, AssignmentStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
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
}: {
  people: JobPerson[];
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={`Booked (${booked.length})`} description="Workers who accepted. Their phone numbers are shared with you." />
        <CardBody>
          {booked.length === 0 ? (
            <EmptyState title="Nobody has accepted yet" />
          ) : (
            <ul className="divide-y divide-line">
              {booked.map((p) => (
                <PersonRow key={p.worker_user_id} person={p}>
                  <p className="text-sm text-ink-soft">
                    {p.phone ? <a href={`tel:${p.phone}`} className="font-medium text-brand hover:underline">{p.phone}</a> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {p.checked_in_at ? `Checked in ${formatDateTime(p.checked_in_at)}` : "Not checked in"}
                    {p.checked_out_at ? ` · Checked out ${formatDateTime(p.checked_out_at)}` : ""}
                  </p>
                  {canChange && cancelAction && p.assignment_status === "accepted" ? (
                    <CancelForm action={cancelAction} assignmentId={p.assignment_id!} />
                  ) : null}
                </PersonRow>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {offered.length ? (
        <Card>
          <CardHeader title={`Offered (${offered.length})`} description="Waiting for the worker to accept or decline." />
          <CardBody>
            <ul className="divide-y divide-line">
              {offered.map((p) => (
                <PersonRow key={p.worker_user_id} person={p}>
                  <p className="text-xs text-muted">Offered {formatDateTime(p.offered_at)}</p>
                  {canChange && cancelAction ? <CancelForm action={cancelAction} assignmentId={p.assignment_id!} label="Withdraw offer" /> : null}
                </PersonRow>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={`Applicants (${applicants.length})`} description="Approved QuickPro workers who applied." />
        <CardBody>
          {applicants.length === 0 ? (
            <EmptyState title="No new applicants" />
          ) : (
            <ul className="divide-y divide-line">
              {applicants.map((p) => (
                <PersonRow key={p.worker_user_id} person={p}>
                  {p.application_note ? <p className="text-sm text-ink-soft">“{p.application_note}”</p> : null}
                  <p className="text-xs text-muted">Applied {formatDateTime(p.applied_at)}</p>
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
                </PersonRow>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {others.length ? (
        <Card>
          <CardHeader title="Earlier" description="Declined, withdrawn and cancelled." />
          <CardBody>
            <ul className="divide-y divide-line">
              {others.map((p) => (
                <PersonRow key={p.worker_user_id} person={p}>
                  {p.cancel_reason ? <p className="text-xs text-muted">Reason: {p.cancel_reason}</p> : null}
                </PersonRow>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function PersonRow({ person: p, children }: { person: JobPerson; children?: React.ReactNode }) {
  return (
    <li className="space-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{p.full_name || "Unnamed worker"}</p>
          <p className="text-sm text-muted">
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
      <p className="text-xs text-muted">
        {p.matching_skills > 0 ? `${p.matching_skills} of the skills you asked for` : "None of the skills you asked for"}
        {p.skill_names.length ? ` · Skills: ${p.skill_names.join(", ")}` : ""}
        {p.has_vehicle ? " · Has a vehicle" : ""}
        {p.has_drivers_license ? " · Driver's license" : ""}
      </p>
      {children}
    </li>
  );
}

function CancelForm({ action, assignmentId, label = "Cancel assignment" }: { action: Action; assignmentId: string; label?: string }) {
  return (
    <details className="pt-1">
      <summary className="cursor-pointer text-sm font-medium text-bad">{label}</summary>
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
