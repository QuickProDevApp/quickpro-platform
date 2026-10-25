import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminDocumentRow, ReviewDecisionForm } from "@/components/app/admin-review";
import { ReviewStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { WEEKDAYS, formatCents, formatDateTime, formatTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { requireAdmin } from "@/server/auth/session";
import { getWorkerDetailForAdmin } from "@/server/data/admin";
import { reviewDocumentAction, reviewWorkerAction } from "../../actions";

export const metadata: Metadata = { title: "Worker review" };

export default async function AdminWorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const detail = await getWorkerDetailForAdmin(admin.id, id);
  if (!detail) notFound();
  const { profile: p, skills, areas, availability, documents } = detail;

  const facts: [string, React.ReactNode][] = [
    ["Email", p.email],
    ["Phone", p.phone],
    ["Home area", p.home_area_name],
    ["Travel", `Up to ${p.max_travel_miles} miles`],
    ["Transportation", p.has_vehicle ? "Has reliable transportation" : "No vehicle"],
    ["Driver's license", p.has_drivers_license ? "Yes" : "No"],
    ["Experience", p.years_experience != null ? `${p.years_experience} years` : null],
    ["Desired pay", p.desired_hourly_rate_cents ? `${formatCents(p.desired_hourly_rate_cents)}/hr` : null],
    ["Submitted", p.submitted_at ? formatDateTime(p.submitted_at) : null],
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/app/admin/workers", label: "Workers" }}
        title={p.full_name || p.email}
        meta={<ReviewStatusBadge status={p.status} />}
        description={p.headline || undefined}
        actions={
          <Link href={`/app/admin/audit?entityType=worker_profile&entityId=${p.user_id}`} className="text-sm font-medium text-brand hover:underline">
            Audit history
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile" />
            <CardBody className="space-y-4 text-sm">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
                    <dd className="mt-0.5">{value ?? <span className="text-muted">Not provided</span>}</dd>
                  </div>
                ))}
              </dl>
              {p.bio ? <p className="whitespace-pre-line text-ink-soft">{p.bio}</p> : null}
              <div>
                <p className="text-xs font-medium tracking-wide text-muted uppercase">Skills</p>
                <p className="mt-0.5">{skills.join(", ") || <span className="text-muted">None</span>}</p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted uppercase">Preferred towns</p>
                <p className="mt-0.5">{areas.join(", ") || <span className="text-muted">None</span>}</p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted uppercase">Availability (Eastern)</p>
                <p className="mt-0.5">
                  {availability.length
                    ? availability.map((w) => `${WEEKDAYS[w.weekday].slice(0, 3)} ${formatTime(w.start_time)}–${formatTime(w.end_time)}`).join(", ")
                    : <span className="text-muted">None</span>}
                </p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Certifications" />
            <CardBody>
              {documents.length === 0 ? (
                <EmptyState title="No documents uploaded" />
              ) : (
                <ul className="divide-y divide-line">
                  {documents.map((d) => (
                    <AdminDocumentRow key={d.id} doc={d} action={reviewDocumentAction.bind(null, d.id)} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Decision" />
          <CardBody className="space-y-3">
            {p.rereview_reason ? (
              <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                Back in review after changes to approved details: {p.rereview_reason}
              </p>
            ) : null}
            {p.review_notes ? <p className="text-sm text-ink-soft">Last note: {p.review_notes}</p> : null}
            <ReviewDecisionForm status={p.status} action={reviewWorkerAction.bind(null, p.user_id)} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
