import { ReadinessList } from "@/components/app/readiness";
import { StatusBanner } from "@/components/app/status-banner";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { WEEKDAYS, formatCents, formatTime } from "@/lib/labels";
import { requireUser } from "@/server/auth/session";
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

  return (
    <div className="space-y-6">
      <StatusBanner status={profile.status} notes={profile.review_notes} submittedAt={profile.submitted_at} subject="worker profile" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
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
          <Card>
            <CardHeader title="What's next" />
            <CardBody className="space-y-2 text-sm text-ink-soft">
              <p>
                QuickPro staff match approved workers with local service businesses that need extra hands. Browsing and
                applying for shifts yourself is the next feature to ship.
              </p>
              <p>
                Each business you work with will tell you how you are engaged (for example as their employee) and
                handle the paperwork that requires.
              </p>
            </CardBody>
          </Card>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
