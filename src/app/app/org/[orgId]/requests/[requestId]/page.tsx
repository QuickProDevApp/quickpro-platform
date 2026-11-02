import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobThread } from "@/components/app/job-thread";
import { ProjectJobs, ProjectNotice, ProjectProgress, ProjectTimeline, projectStages } from "@/components/app/project";
import { QuoteList } from "@/components/app/quote-list";
import { RequestFacts, RequestSiteFacts } from "@/components/app/request-summary";
import { Badge, QuoteStatusBadge, RequestStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { formatCents, formatDate, formatDateTime } from "@/lib/labels";
import { uuid } from "@/lib/schemas";
import { requireMembership } from "@/server/actions/guards";
import type { CurrentUser } from "@/server/auth/session";
import { canDispatch, getInsuranceStatus, type OrganizationWithRole } from "@/server/data/organizations";
import {
  contractorDirectory,
  getContractorQuote,
  getRequest,
  getProjectThread,
  getRequestSite,
  isInvited,
  listInvitedContractorIds,
  listProjectAttendance,
  listProjectEvents,
  listProjectJobs,
  listRequestQuotes,
  type ServiceRequest,
} from "@/server/data/requests";
import {
  acceptQuoteAction,
  cancelRequestAction,
  confirmCompletionAction,
  declineQuoteAction,
  inviteContractorAction,
  postProjectMessageAction,
  reopenWorkAction,
  reportWorkCompleteAction,
  submitQuoteAction,
  withdrawQuoteAction,
} from "../actions";

export const metadata: Metadata = { title: "Request" };

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; requestId: string }>;
  searchParams: Promise<{ posted?: string; awarded?: string; sentback?: string }>;
}) {
  const { orgId, requestId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (!uuid.safeParse(requestId).success) notFound();
  const request = await getRequest(user.id, requestId);
  if (!request) notFound();
  if (org.kind === "customer" && request.organization_id !== org.id) notFound();
  const query = await searchParams;
  const posted = query.posted === "1";
  const justAwarded = query.awarded === "1" && request.status === "awarded" && org.kind === "customer";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/app/org/${org.id}/requests`} className="text-sm text-muted hover:text-ink">
          ← Requests
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-ink">{request.title}</h2>
          <RequestStatusBadge status={request.status} workReported={!!request.work_completed_at} />
        </div>
        <p className="text-sm text-muted">
          {org.kind === "contractor" ? `${request.customer_name} · ` : ""}
          {request.category_name} · {request.area_name}
        </p>
      </div>
      {posted ? (
        <FormMessage tone="ok">
          Request posted. Contractors who serve {request.area_name} for {request.category_name.toLowerCase()} can see it
          now, and you&apos;ll get a QuickPro notification for each quote.
        </FormMessage>
      ) : null}
      {justAwarded ? (
        <FormMessage tone="ok">
          Quote accepted. The contractor can now see the site address and contact, and the other quotes were declined.
        </FormMessage>
      ) : null}
      {query.sentback === "1" && org.kind === "customer" && request.status === "awarded" && !request.work_completed_at ? (
        <FormMessage tone="ok">Sent back to the contractor with your note. They&apos;ll report the work complete again when it&apos;s done.</FormMessage>
      ) : null}
      {request.status === "cancelled" ? (
        <FormMessage tone="bad">
          Cancelled {formatDateTime(request.cancelled_at)}: {request.cancel_reason}
        </FormMessage>
      ) : null}
      {request.status === "completed" ? (
        <FormMessage tone="ok">Completed and confirmed {formatDateTime(request.completed_at)}.</FormMessage>
      ) : null}
      {org.kind === "customer" ? (
        <CustomerView user={user} org={org} request={request} />
      ) : (
        <ContractorView user={user} org={org} request={request} />
      )}
    </div>
  );
}

function Details({ request, showCustomer }: { request: ServiceRequest; showCustomer?: boolean }) {
  return (
    <Card>
      <CardHeader title="Details" />
      <CardBody className="space-y-4">
        <RequestFacts request={request} showCustomer={showCustomer} />
        <p className="border-t border-line pt-4 text-sm whitespace-pre-line text-ink-soft">{request.description}</p>
        {request.requirements ? (
          <div className="border-t border-line pt-4">
            <p className="text-xs font-medium tracking-wide text-faint uppercase">Requirements</p>
            <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{request.requirements}</p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

async function CustomerView({
  user,
  org,
  request,
}: {
  user: CurrentUser;
  org: OrganizationWithRole;
  request: ServiceRequest;
}) {
  const dispatcher = canDispatch(org.my_role);
  const open = request.status === "open";
  const project = request.awarded_contractor_id !== null;
  const [quotes, site, invited, directory, work] = await Promise.all([
    listRequestQuotes(user.id, request.id),
    getRequestSite(user.id, request.id),
    open && dispatcher ? listInvitedContractorIds(user.id, request.id) : Promise.resolve([]),
    open && dispatcher ? contractorDirectory(user.id, org.id, request.category_id, null) : Promise.resolve([]),
    project ? loadProject(user.id, request.id) : Promise.resolve(null),
  ]);
  const quotedIds = new Set(quotes.filter((q) => q.status !== "withdrawn").map((q) => q.contractor_id));
  const awarded = quotes.find((q) => q.status === "accepted");
  const visibleQuotes = quotes.filter((q) => q.status !== "withdrawn");
  const withdrawn = quotes.length - visibleQuotes.length;
  const stateOf = (id: string) => (quotedIds.has(id) ? "quoted" : invited.includes(id) ? "invited" : null);
  // Contractors still to ask come first, those serving the town first among them.
  const rank = (c: (typeof directory)[number]) =>
    stateOf(c.id) ? 2 : c.area_names.includes(request.area_name) ? 0 : 1;
  const ranked = [...directory].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  const reported = request.status === "awarded" && request.work_completed_at !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {work && awarded ? (
          <>
            {reported ? (
              <ProjectNotice tone="warn" title={`${awarded.contractor_name} reported the work complete`}>
                <p>
                  Reported {formatDateTime(request.work_completed_at)}
                  {request.completion_note ? `: “${request.completion_note}”` : "."} Check the work, then confirm it or
                  send it back with what still needs doing.
                </p>
                {dispatcher ? (
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <ActionForm action={confirmCompletionAction.bind(null, org.id, request.id)} successMessage={false}>
                      <SubmitButton pendingLabel="Confirming…">Confirm completion</SubmitButton>
                    </ActionForm>
                    <details className="group min-w-0 flex-1">
                      <summary className="inline-flex h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-ink-soft hover:bg-surface/70">
                        Not finished yet…
                      </summary>
                      <ActionForm action={reopenWorkAction.bind(null, org.id, request.id)} className="mt-2 space-y-3">
                        <Field name="reason" id="reopen-reason" label="What still needs doing">
                          <Textarea name="reason" id="reopen-reason" required maxLength={1000} rows={2} />
                        </Field>
                        <SubmitButton variant="secondary" pendingLabel="Sending…">
                          Send back to contractor
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  </div>
                ) : null}
              </ProjectNotice>
            ) : null}
            <ProjectStatus request={request} work={work} />
            <ProjectJobs
              jobs={work.jobs}
              attendance={work.attendance}
              emptyText={`${awarded.contractor_name} schedules the crew here. You'll see each job, who's booked, and when they check in and out.`}
            />
            <JobThread
              messages={work.messages}
              currentUserId={user.id}
              postAction={
                request.status !== "cancelled" ? postProjectMessageAction.bind(null, org.id, request.id) : undefined
              }
              description={`Between your team and ${awarded.contractor_name}. Both sides get a QuickPro notification; nothing is emailed.`}
              placeholder="Start date, access, scope questions…"
            />
          </>
        ) : null}
        <Card>
          <CardHeader
            title={awarded ? "Awarded" : `Quotes (${visibleQuotes.length})`}
            description={
              awarded
                ? `${awarded.contractor_name} · ${formatCents(awarded.amount_cents)} · accepted ${formatDateTime(awarded.decided_at)}`
                : open
                  ? "Each contractor sees only its own quote. Prices are totals for the work described."
                  : undefined
            }
          />
          {visibleQuotes.length === 0 ? (
            <CardBody>
              <EmptyState title="No quotes yet">
                {open ? "Contractors who serve this town can quote now. You can also invite contractors below." : null}
              </EmptyState>
            </CardBody>
          ) : (
            <QuoteList
              quotes={visibleQuotes}
              acceptAction={dispatcher && open ? acceptQuoteAction.bind(null, org.id, request.id) : undefined}
              declineAction={dispatcher && open ? declineQuoteAction.bind(null, org.id, request.id) : undefined}
            />
          )}
          {withdrawn > 0 ? (
            <p className="border-t border-line px-4 py-2.5 text-[13px] text-muted sm:px-5">
              {withdrawn} {withdrawn === 1 ? "contractor" : "contractors"} withdrew a quote.
            </p>
          ) : null}
        </Card>

        {open && dispatcher ? (
          <Card>
            <CardHeader
              title="Invite contractors"
              description={`Approved ${request.category_name.toLowerCase()} contractors in ${org.market_name}. Invited contractors can quote even if they don't list ${request.area_name}.`}
            />
            {directory.length === 0 ? (
              <CardBody>
                <EmptyState title="No approved contractors list this service yet" />
              </CardBody>
            ) : (
              <InviteList>
                {ranked.map((c) => {
                  const state = stateOf(c.id);
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                      data-testid="invite-row"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{c.name}</p>
                        <p className="text-[13px] text-muted">
                          {c.area_names.includes(request.area_name)
                            ? `Serves ${request.area_name}`
                            : `Doesn't list ${request.area_name}`}
                          {c.years_in_business != null ? ` · ${c.years_in_business} years in business` : ""}
                        </p>
                      </div>
                      {state === "quoted" ? (
                        <Badge tone="ok">Quoted</Badge>
                      ) : state === "invited" ? (
                        <Badge tone="info">Invited</Badge>
                      ) : (
                        <ActionForm
                          action={inviteContractorAction.bind(null, org.id, request.id)}
                          className="flex items-center gap-2"
                          successMessage={false}
                        >
                          <input type="hidden" name="contractorId" value={c.id} />
                          <SubmitButton variant="secondary" size="sm" pendingLabel="Inviting…">
                            Invite to quote
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </li>
                  );
                })}
              </InviteList>
            )}
          </Card>
        ) : null}
      </div>

      <div className="space-y-6">
        <Details request={request} />
        {site ? (
          <Card>
            <CardHeader
              title="Site and contact"
              description={
                awarded ? `Shared with ${awarded.contractor_name}.` : "Shared only with the contractor you award."
              }
            />
            <CardBody>
              <RequestSiteFacts site={site} />
            </CardBody>
          </Card>
        ) : null}
        {work ? <ProjectTimeline events={work.events} /> : null}
        {dispatcher && (open || request.status === "awarded") ? (
          <Card>
            <CardHeader
              title="Cancel request"
              description={
                open
                  ? "Declines every open quote. Contractors see your reason."
                  : "The awarded contractor sees your reason."
              }
            />
            <CardBody>
              <ActionForm action={cancelRequestAction.bind(null, org.id, request.id)}>
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
  );
}

async function ContractorView({
  user,
  org,
  request,
}: {
  user: CurrentUser;
  org: OrganizationWithRole;
  request: ServiceRequest;
}) {
  const dispatcher = canDispatch(org.my_role);
  const won = request.awarded_contractor_id === org.id;
  const [quote, site, invited, insurance, work] = await Promise.all([
    getContractorQuote(user.id, request.id, org.id),
    getRequestSite(user.id, request.id),
    isInvited(user.id, request.id, org.id),
    getInsuranceStatus(user.id, org.id),
    won ? loadProject(user.id, request.id) : Promise.resolve(null),
  ]);
  const open = request.status === "open";
  const canQuote = dispatcher && open && quote?.status !== "declined" && quote?.status !== "accepted";
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const defaultValid = new Date(now.getTime() + 30 * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const live = quote && quote.status === "submitted";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {invited && open && !quote ? (
          <FormMessage tone="info">{request.customer_name} invited your business to quote on this request.</FormMessage>
        ) : null}
        {quote?.status === "accepted" && work && work.jobs.length === 0 && request.status === "awarded" ? (
          <FormMessage tone="ok">
            {request.customer_name} accepted your quote of {formatCents(quote.amount_cents)}. Schedule the jobs for this
            project below; the site address and contact are filled in for you.
          </FormMessage>
        ) : null}
        {work ? (
          <ContractorProject org={org} request={request} work={work} userId={user.id} dispatcher={dispatcher} />
        ) : null}
        {quote?.status === "declined" ? (
          <FormMessage tone="info">
            Your quote wasn&apos;t accepted{quote.decision_note ? `: ${quote.decision_note}` : "."}
          </FormMessage>
        ) : null}

        {quote ? (
          <Card>
            <CardHeader
              title="Your quote"
              action={<QuoteStatusBadge status={quote.status} expired={quote.expired} />}
              description={`Sent ${formatDateTime(quote.submitted_at)}${quote.revision > 1 ? `, revision ${quote.revision}` : ""}`}
            />
            <CardBody className="space-y-2">
              <p className="tabular text-lg font-semibold text-ink">{formatCents(quote.amount_cents)}</p>
              <p className="text-sm whitespace-pre-line text-ink-soft">{quote.scope}</p>
              <p className="text-[13px] text-muted">
                {quote.estimated_start ? `Can start ${formatDate(quote.estimated_start)} · ` : ""}Valid until{" "}
                {formatDate(quote.valid_until)}
              </p>
              {live && dispatcher && open ? (
                <ActionForm action={withdrawQuoteAction.bind(null, org.id, request.id)} className="pt-2">
                  <SubmitButton variant="ghost" size="sm" pendingLabel="Withdrawing…">
                    Withdraw quote
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        {canQuote ? (
          insurance !== "current" ? (
            <FormMessage tone="bad">
              Quoting needs a current general liability certificate reviewed by QuickPro staff. Upload your renewal on
              the Documents tab.
            </FormMessage>
          ) : (
            <Card>
              <CardHeader
                title={live ? "Revise your quote" : quote ? "Quote again" : "Send a quote"}
                description="The customer sees your business name, price and scope. Other contractors never see your quote."
              />
              <CardBody>
                <ActionForm action={submitQuoteAction.bind(null, org.id, request.id)}>
                  <Field
                    name="amount"
                    label="Total price (USD)"
                    hint="For the work described, including materials you supply."
                  >
                    <Input
                      name="amount"
                      inputMode="decimal"
                      defaultValue={quote ? (quote.amount_cents / 100).toFixed(2) : undefined}
                      placeholder="3,200"
                      required
                    />
                  </Field>
                  <Field
                    name="scope"
                    label="What's included"
                    hint="Tasks, frequency, crew, supplies, and anything excluded."
                  >
                    <Textarea
                      name="scope"
                      defaultValue={quote?.scope}
                      required
                      minLength={10}
                      maxLength={4000}
                      rows={4}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="estimatedStart" label="Earliest start" hint="Optional">
                      <Input
                        type="date"
                        name="estimatedStart"
                        min={today}
                        defaultValue={quote?.estimated_start ?? undefined}
                      />
                    </Field>
                    <Field name="validUntil" label="Price good until">
                      <Input
                        type="date"
                        name="validUntil"
                        min={today}
                        defaultValue={quote && !quote.expired ? quote.valid_until : defaultValid}
                        required
                      />
                    </Field>
                  </div>
                  <SubmitButton pendingLabel="Sending…">{live ? "Update quote" : "Send quote"}</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )
        ) : !dispatcher && open && !quote ? (
          <FormMessage tone="info">Owners, admins and dispatchers on your team can quote on this request.</FormMessage>
        ) : null}
      </div>
      {/* Phones read the request before the quote form. */}
      <div className="-order-1 space-y-6 lg:order-none">
        <Details request={request} showCustomer />
        {site ? (
          <Card>
            <CardHeader title="Site and contact" />
            <CardBody>
              <RequestSiteFacts site={site} />
            </CardBody>
          </Card>
        ) : (
          <p className="px-1 text-[13px] text-muted">
            The street address and on-site contact are shared if your quote is accepted.
          </p>
        )}
        {work ? <ProjectTimeline events={work.events} /> : null}
      </div>
    </div>
  );
}

type ProjectData = Awaited<ReturnType<typeof loadProject>>;

/** Everything the two businesses see about an awarded project. */
async function loadProject(userId: string, requestId: string) {
  const [jobs, attendance, events, messages] = await Promise.all([
    listProjectJobs(userId, requestId),
    listProjectAttendance(userId, requestId),
    listProjectEvents(userId, requestId),
    getProjectThread(userId, requestId),
  ]);
  return { jobs, attendance, events, messages };
}

function ProjectStatus({ request, work }: { request: ServiceRequest; work: ProjectData }) {
  const live = work.jobs.filter((j) => j.status === "open" || j.status === "filled").length;
  const done = work.jobs.filter((j) => j.status === "completed").length;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Project progress</p>
          <p className="tabular text-[13px] text-muted">
            {done} completed · {live} upcoming or under way
          </p>
        </div>
        <ProjectProgress stages={projectStages(request, work.jobs)} />
      </CardBody>
    </Card>
  );
}

function ContractorProject({
  org,
  request,
  work,
  userId,
  dispatcher,
}: {
  org: OrganizationWithRole;
  request: ServiceRequest;
  work: ProjectData;
  userId: string;
  dispatcher: boolean;
}) {
  const inProgress = request.status === "awarded";
  const reported = inProgress && request.work_completed_at !== null;
  const open = work.jobs.filter((j) => j.status === "open" || j.status === "filled").length;
  const completed = work.jobs.filter((j) => j.status === "completed").length;
  const canSchedule = dispatcher && inProgress && !reported;
  const lastReopen = [...work.events].reverse().find((e) => e.kind === "work.reopened" || e.kind === "work.reported");
  return (
    <>
      {reported ? (
        <ProjectNotice tone="info" title={`Waiting for ${request.customer_name} to confirm`}>
          You reported the work complete {formatDateTime(request.work_completed_at)}. They can confirm it or send it
          back with a note.
        </ProjectNotice>
      ) : lastReopen?.kind === "work.reopened" && inProgress ? (
        <ProjectNotice tone="warn" title={`${request.customer_name} sent the work back`}>
          “{lastReopen.detail}” Schedule what&apos;s left, then report the work complete again.
        </ProjectNotice>
      ) : null}
      <ProjectStatus request={request} work={work} />
      <ProjectJobs
        jobs={work.jobs}
        attendance={work.attendance}
        jobHref={(id) => `/app/org/${org.id}/jobs/${id}`}
        action={
          canSchedule ? (
            <LinkButton href={`/app/org/${org.id}/jobs/new?request=${request.id}`} size="sm">
              Schedule a job
            </LinkButton>
          ) : undefined
        }
        emptyText="Schedule a job to staff this project. Each job is posted to approved workers, and you choose who to offer it to."
      />
      {dispatcher && inProgress && !reported ? (
        <Card>
          <CardHeader
            title="Report the work complete"
            description={`${request.customer_name} is asked to confirm. They can send it back with a note if something is left.`}
          />
          <CardBody>
            {open > 0 || completed === 0 ? (
              <p className="text-sm text-muted">
                {open > 0
                  ? `Complete or cancel the ${open} ${open === 1 ? "job" : "jobs"} still open first. A job can be marked complete once it has started.`
                  : "Complete at least one job on this project first."}
              </p>
            ) : (
              <ActionForm action={reportWorkCompleteAction.bind(null, org.id, request.id)}>
                <Field name="note" label="Note for the customer" hint="Optional. What was done, anything to know.">
                  <Textarea name="note" maxLength={1000} rows={2} />
                </Field>
                <SubmitButton pendingLabel="Reporting…">Report work complete</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      ) : null}
      <JobThread
        messages={work.messages}
        currentUserId={userId}
        postAction={
          request.status !== "cancelled" ? postProjectMessageAction.bind(null, org.id, request.id) : undefined
        }
        description={`Between your team and ${request.customer_name}. Workers don't see this thread; use each job's messages for the crew.`}
        placeholder="Start date, access, scope questions…"
      />
    </>
  );
}

/** The first eight rows, with the rest behind a disclosure so long directories don't bury the page. */
function InviteList({ children }: { children: React.ReactNode[] }) {
  const first = children.slice(0, 8);
  const rest = children.slice(8);
  return (
    <>
      <ul className="divide-y divide-line">{first}</ul>
      {rest.length ? (
        <details className="group border-t border-line">
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-brand hover:bg-subtle/60 sm:px-5">
            <span className="group-open:hidden">Show {rest.length} more</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">{rest}</ul>
        </details>
      ) : null}
    </>
  );
}
