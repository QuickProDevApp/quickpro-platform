import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminDocumentRow, ReviewDecisionForm } from "@/components/app/admin-review";
import { ReviewStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ORGANIZATION_KIND_LABEL, formatDateTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { requireAdmin } from "@/server/auth/session";
import { getOrganizationDetailForAdmin } from "@/server/data/admin";
import { reviewDocumentAction, reviewOrganizationAction } from "../../actions";

export const metadata: Metadata = { title: "Organization review" };

export default async function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const detail = await getOrganizationDetailForAdmin(admin.id, id);
  if (!detail) notFound();
  const { organization: o, members, categories, areas, documents } = detail;

  const facts: [string, React.ReactNode][] = [
    ["Legal name", o.legal_name],
    ["Phone", o.phone],
    ["Email", o.email],
    ["Website", o.website ? <a href={o.website} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{o.website}</a> : null],
    ["Address", [o.address_line1, o.city, o.postal_code].filter(Boolean).join(", ") || null],
    ["Market", o.market_name],
    ["Years in business", o.years_in_business],
    ["Crew size", o.crew_size],
    ["Submitted", o.submitted_at ? formatDateTime(o.submitted_at) : null],
    ["Last review", o.reviewed_at ? `${formatDateTime(o.reviewed_at)} by ${o.reviewer_email ?? "staff"}` : null],
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/app/admin/organizations", label: "Organizations" }}
        title={o.name}
        meta={<ReviewStatusBadge status={o.status} />}
        description={`${ORGANIZATION_KIND_LABEL[o.kind]} registered ${formatDateTime(o.created_at)}`}
        actions={
          <Link href={`/app/admin/audit?organization=${o.id}`} className="text-sm font-medium text-brand hover:underline">
            Audit history
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
                    <dd className="mt-0.5">{value ?? <span className="text-muted">Not provided</span>}</dd>
                  </div>
                ))}
              </dl>
              {o.description ? <p className="mt-4 text-sm whitespace-pre-line text-ink-soft">{o.description}</p> : null}
              {o.kind === "contractor" ? (
                <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">Services</p>
                    <p className="mt-0.5">{categories.join(", ") || <span className="text-muted">None</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">Areas</p>
                    <p className="mt-0.5">{areas.join(", ") || <span className="text-muted">None</span>}</p>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Documents" description="Reviewing a document records that staff looked at it. It is not verification with the insurer or issuer." />
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
        <div className="space-y-6">
          <Card>
            <CardHeader title="Decision" />
            <CardBody className="space-y-3">
              {o.review_notes ? <p className="text-sm text-ink-soft">Last note: {o.review_notes}</p> : null}
              <ReviewDecisionForm status={o.status} action={reviewOrganizationAction.bind(null, o.id)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="People" />
            <CardBody>
              <ul className="space-y-3 text-sm">
                {members.map((m) => (
                  <li key={m.user_id}>
                    <p className="font-medium">{m.full_name || m.email}</p>
                    <p className="text-muted">
                      {m.role} · {m.email}
                      {m.phone ? ` · ${m.phone}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
