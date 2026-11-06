import { ReadinessList } from "@/components/app/readiness";
import { StatTiles, type StatTile } from "@/components/app/stat-tiles";
import { StatusBanner } from "@/components/app/status-banner";
import { OrgSubcontractList } from "@/components/app/subcontracts";
import { DocumentStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, FormMessage, SubmitButton } from "@/components/ui/form";
import { DOCUMENT_TYPE_LABEL, formatCents, formatDate } from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";
import { listOrganizationJobs } from "@/server/data/jobs";
import Link from "next/link";
import { listDocuments } from "@/server/data/documents";
import {
  canDispatch,
  canManage,
  getContractorCapabilities,
  getInsuranceStatus,
  getOrganizationReadiness,
} from "@/server/data/organizations";
import { listCategories, listServiceAreas } from "@/server/data/reference";
import {
  countOpenRequestsForContractor,
  listContractorRequests,
  listCustomerRequests,
} from "@/server/data/requests";
import { listOrgSubcontracts } from "@/server/data/subcontracts";
import { listOrgInvoices, type InvoiceRow } from "@/server/data/invoices";
import { submitOrganizationAction } from "./actions";
import {
  ContractorProjectsPanel,
  CustomerRequestsPanel,
  InsuranceCard,
  InvoicesToPay,
  Operations,
  TagList,
  subcontractSummaryLine,
} from "@/components/app/org-overview";

export default async function OrganizationOverview({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  const manager = canManage(org.my_role);
  const isContractor = org.kind === "contractor";

  const operating = isContractor && org.status === "approved";
  const [readiness, documents, caps, categories, areas, insurance, upcoming] = await Promise.all([
    getOrganizationReadiness(user.id, org),
    listDocuments(user.id, { kind: "org", orgId: org.id }),
    isContractor ? getContractorCapabilities(user.id, org.id) : null,
    isContractor ? listCategories(user.id) : [],
    isContractor ? listServiceAreas(user.id, org.market_id) : [],
    isContractor ? getInsuranceStatus(user.id, org.id) : null,
    operating ? listOrganizationJobs(user.id, org.id, "upcoming") : [],
  ]);
  const customerOperating = !isContractor && org.status === "approved";
  const [requests, openToQuote, won, subcontracts, invoices] = await Promise.all([
    customerOperating ? listCustomerRequests(user.id, org.id, "active") : Promise.resolve([]),
    operating ? countOpenRequestsForContractor(user.id, org.id) : Promise.resolve(0),
    operating ? listContractorRequests(user.id, org.id, "awarded") : Promise.resolve([]),
    operating ? listOrgSubcontracts(user.id, org.id, "sub") : Promise.resolve([]),
    customerOperating ? listOrgInvoices(user.id, org.id) : Promise.resolve([] as InvoiceRow[]),
  ]);
  const toPay = invoices.filter((i) => i.status === "issued" && i.recipient_org_id === org.id);
  const activeProjects = won.filter((r) => r.status === "awarded");
  const liveSubcontracts = subcontracts.filter((s) => s.status === "offered" || s.status === "accepted");
  const canSubmit = manager && (org.status === "draft" || org.status === "rejected");
  const ready = readiness.every((i) => i.done);
  const subject = isContractor ? "business registration" : "organization registration";
  const base = `/app/org/${org.id}`;
  const subOffers = liveSubcontracts.filter((s) => s.status === "offered").length;
  const quotesWaiting = requests.reduce((n, r) => n + (r.status === "open" ? r.quote_count : 0), 0);
  const amountDue = toPay.reduce((n, i) => n + Number(i.total_cents), 0);
  const tiles: StatTile[] | null = operating
    ? [
        {
          label: "Requests to quote",
          value: openToQuote,
          href: `${base}/requests`,
          icon: "inbox",
          highlight: openToQuote > 0,
          hint: openToQuote > 0 ? "Review and quote" : "Matching your services",
        },
        {
          label: "Projects in progress",
          value: activeProjects.length,
          href: `${base}/requests?show=awarded`,
          icon: "hammer",
        },
        { label: "Upcoming jobs", value: upcoming.length, href: `${base}/jobs`, icon: "calendar" },
        {
          label: "Subcontract offers",
          value: subOffers,
          href: `${base}/requests?show=subcontracts`,
          icon: "handshake",
          highlight: subOffers > 0,
          hint: subOffers > 0 ? "Waiting for your answer" : undefined,
        },
      ]
    : customerOperating
      ? [
          { label: "Active requests", value: requests.length, href: `${base}/requests`, icon: "inbox" },
          {
            label: "Quotes to compare",
            value: quotesWaiting,
            href: `${base}/requests`,
            icon: "quote",
            highlight: quotesWaiting > 0,
            hint: quotesWaiting > 0 ? "Waiting for your decision" : undefined,
          },
          {
            label: "Invoices to pay",
            value: toPay.length ? formatCents(amountDue) : 0,
            href: `${base}/invoices`,
            icon: "invoice",
            highlight: toPay.length > 0,
            hint: toPay.length ? `${toPay.length} ${toPay.length === 1 ? "invoice" : "invoices"} due` : undefined,
          },
        ]
      : null;

  return (
    <div className="space-y-6">
      <StatusBanner
        status={org.status}
        notes={org.review_notes}
        submittedAt={org.submitted_at}
        subject={subject}
        rereviewReason={org.rereview_reason}
      />

      {tiles ? <StatTiles tiles={tiles} testId="org-summary" /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
                    <p className="text-xs text-muted">
                      Finish the items above first. We will tell you what is missing.
                    </p>
                  ) : null}
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {operating && openToQuote > 0 ? (
            <FormMessage tone="info">
              {openToQuote} customer {openToQuote === 1 ? "request matches" : "requests match"} your services and towns.{" "}
              <Link href={`/app/org/${org.id}/requests`} className="font-medium text-brand hover:underline">
                Review and quote
              </Link>
            </FormMessage>
          ) : null}
          {liveSubcontracts.length ? (
            <Card>
              <CardHeader
                title="Subcontracts"
                description={subcontractSummaryLine(liveSubcontracts.filter((s) => s.status === "offered").length)}
              />
              <OrgSubcontractList orgId={org.id} items={liveSubcontracts} />
            </Card>
          ) : null}
          {operating && activeProjects.length ? (
            <ContractorProjectsPanel orgId={org.id} projects={activeProjects} />
          ) : null}
          {operating ? (
            <Operations orgId={org.id} jobs={upcoming} canPost={canDispatch(org.my_role)} now={new Date().getTime()} />
          ) : customerOperating ? (
            <>
              {toPay.length ? <InvoicesToPay orgId={org.id} invoices={toPay} /> : null}
              <CustomerRequestsPanel orgId={org.id} requests={requests} canPost={canDispatch(org.my_role)} />
            </>
          ) : isContractor ? (
            <Card>
              <CardHeader title="What's next" />
              <CardBody className="text-sm text-ink-soft">
                <p>
                  Once approved, your business can quote on customer requests for the services and towns you list, and
                  post jobs for approved local workers to apply to.
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="What's next" />
              <CardBody className="text-sm text-ink-soft">
                <p>
                  Once QuickPro staff approve your organization, you can post service requests, invite approved local
                  contractors to quote, and compare their prices side by side.
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
                  <TagList
                    empty="No areas yet"
                    items={areas.filter((a) => caps.areaIds.includes(a.id)).map((a) => a.name)}
                  />
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
                      <p className="font-medium text-ink">{DOCUMENT_TYPE_LABEL[d.doc_type]}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <DocumentStatusBadge status={d.status} expiresOn={d.expires_on} />
                        {d.expires_on ? (
                          <span className="text-xs text-muted">Expires {formatDate(d.expires_on)}</span>
                        ) : null}
                      </div>
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
