import { ReadinessList } from "@/components/app/readiness";
import { StatusBanner } from "@/components/app/status-banner";
import { DocumentStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { DOCUMENT_TYPE_LABEL, INSURANCE_STATUS_LABEL, formatDate, type InsuranceStatus } from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";
import { listDocuments } from "@/server/data/documents";
import {
  canDispatch,
  canManage,
  getContractorCapabilities,
  getInsuranceStatus,
  getOrganizationReadiness,
} from "@/server/data/organizations";
import { listCategories, listServiceAreas } from "@/server/data/reference";
import { submitOrganizationAction } from "./actions";

export default async function OrganizationOverview({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  const manager = canManage(org.my_role);
  const isContractor = org.kind === "contractor";

  const [readiness, documents, caps, categories, areas, insurance] = await Promise.all([
    getOrganizationReadiness(user.id, org),
    listDocuments(user.id, { kind: "org", orgId: org.id }),
    isContractor ? getContractorCapabilities(user.id, org.id) : null,
    isContractor ? listCategories(user.id) : [],
    isContractor ? listServiceAreas(user.id, org.market_id) : [],
    isContractor ? getInsuranceStatus(user.id, org.id) : null,
  ]);
  const canSubmit = manager && (org.status === "draft" || org.status === "rejected");
  const ready = readiness.every((i) => i.done);
  const subject = isContractor ? "business registration" : "organization registration";

  return (
    <div className="space-y-6">
      <StatusBanner
        status={org.status}
        notes={org.review_notes}
        submittedAt={org.submitted_at}
        subject={subject}
        rereviewReason={org.rereview_reason}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {canSubmit ? (
            <Card>
              <CardHeader
                title="Registration checklist"
                description="QuickPro staff review every registration before it can take part in the marketplace."
              />
              <CardBody className="space-y-4">
                <ReadinessList items={readiness} />
                <ActionForm action={submitOrganizationAction.bind(null, org.id)}>
                  <SubmitButton pendingLabel="Submitting…">Submit for review</SubmitButton>
                  {!ready ? (
                    <p className="text-xs text-muted">Finish the items above first. We will tell you what is missing.</p>
                  ) : null}
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {isContractor ? (
            <Card>
              <CardHeader title="What's next" />
              <CardBody className="space-y-2 text-sm text-ink-soft">
                {org.status === "approved" ? (
                  <>
                    <p>
                      Post a job when you need extra hands: approved local workers can find it and apply, and you choose
                      who to offer it to. QuickPro staff can also match workers to your jobs by hand.
                    </p>
                    {canDispatch(org.my_role) ? (
                      <LinkButton href={`/app/org/${org.id}/jobs/new`} size="sm">
                        Post a job
                      </LinkButton>
                    ) : null}
                    <p>
                      Posting and offering jobs needs a current general liability certificate reviewed by staff, so keep
                      your insurance up to date.
                    </p>
                  </>
                ) : (
                  <p>
                    Once approved, your business can post jobs for approved local workers to apply to, and QuickPro staff
                    can match workers to them by hand.
                  </p>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="What's next" />
              <CardBody className="text-sm text-ink-soft">
                <p>
                  Service requests are not open to customers yet. Once your organization is approved, QuickPro staff can
                  take your requests directly and route them to approved local contractors. We will contact you at{" "}
                  {org.email ?? "your organization email"}.
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {caps ? (
            <Card>
              <CardHeader
                title="Services"
                action={
                  manager ? (
                    <LinkButton href={`/app/org/${org.id}/services`} variant="ghost" size="sm">
                      Edit
                    </LinkButton>
                  ) : null
                }
              />
              <CardBody className="space-y-3 text-sm">
                <TagList
                  empty="No categories yet"
                  items={categories.filter((c) => caps.categoryIds.includes(c.id)).map((c) => c.name)}
                />
                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Areas</p>
                  <TagList empty="No areas yet" items={areas.filter((a) => caps.areaIds.includes(a.id)).map((a) => a.name)} />
                </div>
              </CardBody>
            </Card>
          ) : null}

          {insurance ? <InsuranceCard status={insurance} documentsHref={`/app/org/${org.id}/documents`} /> : null}

          <Card>
            <CardHeader
              title="Documents"
              action={
                <LinkButton href={`/app/org/${org.id}/documents`} variant="ghost" size="sm">
                  {manager ? "Manage" : "View"}
                </LinkButton>
              }
            />
            <CardBody>
              {documents.length === 0 ? (
                <EmptyState title="No documents uploaded" />
              ) : (
                <ul className="space-y-3">
                  {documents.slice(0, 5).map((d) => (
                    <li key={d.id} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-ink">{DOCUMENT_TYPE_LABEL[d.doc_type]}</span>
                        <DocumentStatusBadge status={d.status} expiresOn={d.expires_on} />
                      </div>
                      {d.expires_on ? <p className="text-xs text-muted">Expires {formatDate(d.expires_on)}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

const INSURANCE_TONE: Record<InsuranceStatus, "ok" | "info" | "bad" | "neutral"> = {
  current: "ok",
  pending_review: "info",
  expired: "bad",
  rejected: "bad",
  missing: "neutral",
};

function InsuranceCard({ status, documentsHref }: { status: InsuranceStatus; documentsHref: string }) {
  return (
    <Card>
      <CardHeader title="General liability insurance" action={<Badge tone={INSURANCE_TONE[status]}>{INSURANCE_STATUS_LABEL[status]}</Badge>} />
      <CardBody className="space-y-2 text-sm text-ink-soft">
        <p>
          QuickPro staff must review a current certificate before approving your business. Upload the renewal before
          this one expires; staff track expiring certificates. A staff review means a person checked the certificate
          you uploaded. QuickPro does not confirm coverage with your insurer.
        </p>
        {status !== "current" && status !== "pending_review" ? (
          <a href={documentsHref} className="font-medium text-brand hover:underline">
            Upload a current certificate
          </a>
        ) : null}
      </CardBody>
    </Card>
  );
}

function TagList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i} className="rounded-md bg-canvas px-2 py-1 text-xs text-ink-soft">
          {i}
        </li>
      ))}
    </ul>
  );
}
