import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteList } from "@/components/app/quote-list";
import { RequestFacts, RequestSiteFacts } from "@/components/app/request-summary";
import { RequestStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { requireAdmin } from "@/server/auth/session";
import { JobThread } from "@/components/app/job-thread";
import { ProjectJobs, ProjectTimeline } from "@/components/app/project";
import {
  getProjectThread,
  getRequest,
  getRequestSite,
  listProjectAttendance,
  listProjectEvents,
  listProjectJobs,
  listRequestQuotes,
} from "@/server/data/requests";
import { staffCancelRequestAction, staffCompleteRequestAction } from "../actions";

export const metadata: Metadata = { title: "Service request" };

export default async function AdminRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const admin = await requireAdmin();
  const { requestId } = await params;
  if (!uuid.safeParse(requestId).success) notFound();
  const request = await getRequest(admin.id, requestId);
  if (!request) notFound();
  const project = request.awarded_contractor_id !== null;
  const [site, quotes, jobs, attendance, events, messages] = await Promise.all([
    getRequestSite(admin.id, request.id),
    listRequestQuotes(admin.id, request.id),
    project ? listProjectJobs(admin.id, request.id) : Promise.resolve([]),
    project ? listProjectAttendance(admin.id, request.id) : Promise.resolve([]),
    listProjectEvents(admin.id, request.id),
    project ? getProjectThread(admin.id, request.id) : Promise.resolve([]),
  ]);
  const live = request.status === "open" || request.status === "awarded";

  return (
    <>
      <PageHeader
        back={{ href: "/app/admin/requests", label: "Service requests" }}
        title={request.title}
        meta={<RequestStatusBadge status={request.status} workReported={!!request.work_completed_at} />}
        description={
          <>
            <Link
              href={`/app/admin/organizations/${request.organization_id}`}
              className="font-medium text-brand hover:underline"
            >
              {request.customer_name}
            </Link>{" "}
            · {request.category_name} · {request.area_name}
          </>
        }
      />
      {request.status === "cancelled" ? (
        <FormMessage tone="bad">
          Cancelled {formatDateTime(request.cancelled_at)}: {request.cancel_reason}
        </FormMessage>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {project ? (
            <ProjectJobs
              jobs={jobs}
              attendance={attendance}
              jobHref={(id) => `/app/admin/jobs/${id}`}
              emptyText="The awarded contractor hasn't scheduled any jobs for this project."
            />
          ) : null}
          <Card>
            <CardHeader
              title={`Quotes (${quotes.length})`}
              description="Staff see every quote, including withdrawn ones. Only the customer can accept or decline."
            />
            {quotes.length === 0 ? (
              <CardBody>
                <EmptyState title="No quotes yet" />
              </CardBody>
            ) : (
              <QuoteList quotes={quotes} />
            )}
          </Card>
          {project ? (
            <JobThread
              messages={messages}
              currentUserId={admin.id}
              postAction={undefined}
              description="Between the customer and the awarded contractor. Read-only for staff here."
            />
          ) : null}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-4">
              <RequestFacts request={request} />
              <p className="border-t border-line pt-4 text-sm whitespace-pre-line text-ink-soft">
                {request.description}
              </p>
            </CardBody>
          </Card>
          {site ? (
            <Card>
              <CardHeader title="Site and contact" />
              <CardBody>
                <RequestSiteFacts site={site} />
              </CardBody>
            </Card>
          ) : null}
          <ProjectTimeline events={events} />
          {request.status === "awarded" ? (
            <Card>
              <CardHeader
                title="Close as complete"
                description="For when the work is done but the customer can't confirm. The contractor is notified; the history records staff closed it."
              />
              <CardBody>
                <ActionForm action={staffCompleteRequestAction.bind(null, request.id)}>
                  <SubmitButton variant="secondary" pendingLabel="Closing…">
                    Close as complete
                  </SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {live ? (
            <Card>
              <CardHeader
                title="Cancel request"
                description="For policy or safety problems. The customer and quoting contractors see the reason."
              />
              <CardBody>
                <ActionForm action={staffCancelRequestAction.bind(null, request.id)}>
                  <Field name="reason" label="Reason">
                    <Input name="reason" required maxLength={1000} />
                  </Field>
                  <SubmitButton variant="danger" pendingLabel="Cancelling…">
                    Cancel request
                  </SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
