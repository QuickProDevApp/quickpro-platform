import Link from "next/link";
import { ReadinessList } from "@/components/app/readiness";
import { StatusBanner } from "@/components/app/status-banner";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { WEEKDAYS, formatCents, formatTime, shiftHours, shiftParts } from "@/lib/labels";
import { requireUser } from "@/server/auth/session";
import { listMyWork, type WorkerJob } from "@/server/data/jobs";
import { getWorkerProfile, getWorkerSelections } from "@/server/data/workers";
import { submitWorkerProfileAction } from "./actions";

export default async function WorkerOverview() {
  const user = await requireUser();
  const [profile, selections] = await Promise.all([getWorkerProfile(user.id), getWorkerSelections(user.id)]);
  if (!profile) return null;

  // Mirrors public.submit_worker_profile_for_review, which stays the authority.
  const readiness = [
    { label: "Full name and phone number", done: Boolean(user.fullName && user.phone), href: "/app/account" },
    { label: "Headline", done: profile.headline.trim() !== "", href: "/app/worker/profile" },
    { label: "Home area", done: Boolean(profile.home_service_area_id), href: "/app/worker/profile" },
    { label: "At least one skill", done: selections.skillIds.length > 0, href: "/app/worker/profile" },
    { label: "At least one availability window", done: selections.availability.length > 0, href: "/app/worker/availability" },
  ];
  const canSubmit = profile.status === "draft" || profile.status === "rejected";

  // Upcoming bookings, offers waiting for an answer and open applications.
  const work = profile.status === "approved" ? await listMyWork(user.id) : [];
  const now = new Date();
  const live = (j: WorkerJob) => (j.status === "open" || j.status === "filled") && j.ends_at > now;
  const upcoming = work
    .filter((j) => j.assignment_status === "accepted" && live(j))
    .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
  const offers = work.filter((j) => j.assignment_status === "offered" && j.status === "open" && j.starts_at > now);
  const applied = work.filter((j) => !j.assignment_status && j.application_status === "applied" && j.starts_at > now);

  return (
    <div className="space-y-6">
      <StatusBanner
        status={profile.status}
        notes={profile.review_notes}
        submittedAt={profile.submitted_at}
        subject="worker profile"
        rereviewReason={profile.rereview_reason}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {canSubmit ? (
            <Card>
              <CardHeader title="Profile checklist" description="QuickPro staff review every worker profile." />
              <CardBody className="space-y-4">
                <ReadinessList items={readiness} />
                <ActionForm action={submitWorkerProfileAction}>
                  <SubmitButton pendingLabel="Submitting…">Submit for review</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {profile.status === "approved" ? (
            <>
              <div className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface" data-testid="worker-summary">
                <Stat label="Booked shifts" value={upcoming.length} href="/app/worker/my-jobs" />
                <Stat label="Offers to answer" value={offers.length} href="/app/worker/my-jobs" highlight={offers.length > 0} />
                <Stat label="Applications" value={applied.length} href="/app/worker/my-jobs" />
              </div>
              <Card>
                <CardHeader
                  title="Your next shifts"
                  description="Booked work, soonest first. Addresses and site contacts are on each job."
                  action={
                    <Link href="/app/worker/jobs" className="text-sm font-medium text-brand hover:underline">
                      Find work
                    </Link>
                  }
                />
                {upcoming.length || offers.length ? (
                  <ul className="divide-y divide-line" data-testid="next-shifts">
                    {[...offers, ...upcoming].slice(0, 4).map((j) => {
                      const { day, time } = shiftParts(j.starts_at, j.ends_at);
                      return (
                        <li key={j.id}>
                          <Link
                            href={`/app/worker/jobs/${j.id}`}
                            className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-subtle/70 sm:px-5"
                          >
                            <span className="w-16 shrink-0 border-r border-line pr-3 text-[13px] leading-5 font-medium text-ink">{day}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-medium text-ink">{j.title}</span>
                                {j.assignment_status === "offered" ? (
                                  <Badge dot tone="warn">
                                    Offer waiting
                                  </Badge>
                                ) : null}
                              </span>
                              <span className="block text-[13px] text-muted">
                                {time} · {j.organization_name ?? "Contractor"} · {j.area_name}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="tabular block text-sm font-semibold text-ink">{formatCents(j.pay_rate_cents)}/hr</span>
                              <span className="tabular block text-xs text-muted">
                                ≈ {formatCents(Math.round(j.pay_rate_cents * shiftHours(j.starts_at, j.ends_at)))}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <CardBody className="text-sm text-ink-soft">
                    <p>
                      Nothing booked yet.{" "}
                      <Link href="/app/worker/jobs" className="font-medium text-brand hover:underline">
                        Find work in your towns
                      </Link>{" "}
                      and apply; offers and bookings show up here and under{" "}
                      <Link href="/app/worker/my-jobs" className="font-medium text-brand hover:underline">
                        My jobs
                      </Link>
                      . QuickPro staff may also offer you jobs that fit your skills.
                    </p>
                  </CardBody>
                )}
              </Card>
              <p className="text-[13px] leading-5 text-muted">
                Each job says how the business engages you (for example as its employee). The business handles the paperwork
                that requires, and pays you for approved hours.
              </p>
            </>
          ) : (
            <Card>
              <CardHeader title="What's next" />
              <CardBody className="space-y-2 text-sm text-ink-soft">
                <p>
                  Once QuickPro staff approve your profile, you can find jobs from local businesses and apply. Staff may also
                  offer you jobs that fit your skills.
                </p>
                <p>
                  Each job says how the business engages you (for example as its employee). The business handles the paperwork
                  that requires.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
        <Card className="self-start">
          <CardHeader title="At a glance" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Row label="Home area" value={profile.home_area_name ?? "Not set"} />
              <Row label="Travel" value={`Up to ${profile.max_travel_miles} miles${profile.has_vehicle ? ", has a vehicle" : ""}`} />
              <Row label="Desired rate" value={profile.desired_hourly_rate_cents ? `${formatCents(profile.desired_hourly_rate_cents)}/hr` : "Not set"} />
              <Row
                label="Availability"
                value={
                  selections.availability.length
                    ? selections.availability
                        .map((w) => `${WEEKDAYS[w.weekday].slice(0, 3)} ${formatTime(w.start_time)}–${formatTime(w.end_time)}`)
                        .join(", ")
                    : "None yet"
                }
              />
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, href, highlight = false }: { label: string; value: number; href: string; highlight?: boolean }) {
  return (
    <Link href={href} className="group px-3 py-3 transition-colors first:rounded-l-lg last:rounded-r-lg hover:bg-subtle/70 sm:px-5 sm:py-4">
      <span className={`tabular block text-[22px] leading-7 font-semibold tracking-[-0.02em] ${highlight ? "text-signal-ink" : "text-ink"}`}>
        {value}
      </span>
      <span className="block text-[12.5px] leading-5 text-muted group-hover:text-ink-soft">{label}</span>
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
