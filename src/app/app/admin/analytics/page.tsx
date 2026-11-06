import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActivityChart, type ActivityColumn } from "@/components/app/activity-chart";
import { FilterLinks } from "@/components/app/filter-links";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatCents, formatDateTime } from "@/lib/labels";
import { requireAdmin } from "@/server/auth/session";
import {
  ANALYTICS_PERIODS,
  getMarketAnalytics,
  resolveAnalyticsScope,
  type AreaRow,
  type MarketAnalytics,
  type TrendBucket,
} from "@/server/data/analytics";

export const metadata: Metadata = { title: "Market analytics" };

const PERIOD_LABEL: Record<number, string> = { 7: "7 days", 30: "30 days", 90: "90 days", 365: "12 months" };

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; market?: string; category?: string }>;
}) {
  const admin = await requireAdmin();
  const scope = await resolveAnalyticsScope(admin.id, await searchParams);
  const m = await getMarketAnalytics(admin.id, scope.filter);
  const { projects: p, shifts: s, money, trust, supply } = m;
  const days = scope.filter.days;
  const query = { days: days === 30 ? undefined : String(days), market: scope.market.slug === scope.markets[0].slug ? undefined : scope.market.slug, category: scope.category?.slug };
  const exportQuery = new URLSearchParams({ days: String(days), market: scope.market.slug, ...(scope.category ? { category: scope.category.slug } : {}) });
  const scopeText = `${scope.market.name}${scope.market.is_active ? "" : " (not open yet)"} · ${scope.category?.name ?? "All categories"} · last ${PERIOD_LABEL[days]}`;

  return (
    <>
      <PageHeader
        title="Market analytics"
        description={scopeText}
        actions={
          <a
            href={`/app/admin/analytics/export?${exportQuery}`}
            className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(21,25,30,0.05)] hover:bg-subtle"
            download
          >
            Download CSV
          </a>
        }
      />
      <div className="flex flex-wrap gap-x-3" data-testid="analytics-filters">
        <FilterLinks
          basePath="/app/admin/analytics"
          param="days"
          current={query.days}
          extra={{ market: query.market, category: query.category }}
          options={ANALYTICS_PERIODS.map((d) => ({ value: d === 30 ? undefined : String(d), label: PERIOD_LABEL[d] }))}
        />
        {scope.markets.length > 1 ? (
          <FilterLinks
            basePath="/app/admin/analytics"
            param="market"
            current={query.market}
            extra={{ days: query.days, category: query.category }}
            options={scope.markets.map((mk, i) => ({ value: i === 0 ? undefined : mk.slug, label: mk.name.replace(/ County$/, "") }))}
          />
        ) : null}
        <FilterLinks
          basePath="/app/admin/analytics"
          param="category"
          current={query.category}
          extra={{ days: query.days, market: query.market }}
          options={[{ value: undefined, label: "All categories" }, ...scope.categories.map((c) => ({ value: c.slug, label: c.name }))]}
        />
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="analytics-kpis">
          <Kpi label="Projects posted" value={String(p.posted)} note={`${p.quoted} got a quote${share(p.quoted, p.posted, " (", ")")}`} />
          <Kpi label="Awarded value" value={formatCents(p.awarded_cents)} note={`${p.awarded} ${plural(p.awarded, "project")} awarded`} />
          <Kpi
            label="Shift fill rate"
            value={pct(s.filled, s.positions)}
            note={`${s.filled} of ${s.positions} ${plural(s.positions, "position")} on ${s.jobs} started ${plural(s.jobs, "shift")}`}
          />
          <Kpi label="Invoiced to customers" value={formatCents(money.invoiced_cents)} note={`${formatCents(money.paid_cents)} marked paid`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Shift positions" description={`By ${m.bucket} the shift started, cancelled shifts left out.`} />
            <CardBody>
              <ActivityChart
                columns={columns(m.trend, m.bucket, "filled", "positions")}
                partLabel="Filled"
                restLabel="Not filled"
                totalLabel="Positions"
                emptyText="No shifts started in this period."
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Projects posted" description={`By ${m.bucket} the customer posted, and whether it has been awarded since.`} />
            <CardBody>
              <ActivityChart
                columns={columns(m.trend, m.bucket, "awarded", "requests")}
                partLabel="Awarded"
                restLabel="Not awarded"
                totalLabel="Projects"
                emptyText="No projects posted in this period."
              />
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Section title="Projects" href="/app/admin/requests" linkText="Service requests">
            <Row label="Posted" value={p.posted} />
            <Row label="Got at least one quote" value={`${p.quoted}${share(p.quoted, p.posted, " · ")}`} />
            <Row label="Median time to first quote" value={duration(p.median_hours_to_quote)} />
            <Row label="Awarded since posting" value={`${p.awarded_of_posted}${share(p.awarded_of_posted, p.posted, " · ")}`} />
            <Row label="Cancelled before an award" value={p.cancelled_of_posted} />
            <Row label="Awarded in the period" value={`${p.awarded} · ${formatCents(p.awarded_cents)}`} />
            <Row label="Confirmed complete" value={p.completed} />
          </Section>
          <Section title="Shifts" href="/app/admin/jobs" linkText="Jobs">
            <Row label="Shifts started" value={s.jobs} />
            <Row label="Positions filled" value={`${s.filled} of ${s.positions}`} meter={[s.filled, s.positions]} />
            <Row label="Fully staffed shifts" value={`${s.fully_staffed}${share(s.fully_staffed, s.jobs, " · ")}`} />
            <Row label="Median time to fill" value={duration(s.median_hours_to_fill)} hint="From posting to the booking that filled the last position." />
            <Row
              label="Check-in recorded"
              value={`${s.checked_in} of ${s.ended_bookings}`}
              hint="Bookings on shifts that have ended."
              meter={[s.checked_in, s.ended_bookings]}
            />
            <Row label="Hours checked in and out" value={hours(s.hours_recorded)} hint="Bookings with both a check-in and a check-out." />
          </Section>
          <Section title="Billing" href="/app/admin/invoices" linkText="Invoices">
            <Row label="Invoiced to customers" value={<Amount cents={money.invoiced_cents} count={money.invoiced_count} />} />
            <Row label="Marked paid" value={<Amount cents={money.paid_cents} count={money.paid_count} />} />
            <Row label="Median days to pay" value={money.median_days_to_pay == null ? "—" : `${round1(money.median_days_to_pay)} days`} />
            <Row label="Awaiting payment now" value={<Amount cents={money.outstanding_cents} count={money.outstanding_count} />} />
            <Row
              label="Overdue now"
              value={<Amount cents={money.overdue_cents} count={money.overdue_count} bad={money.overdue_count > 0} />}
            />
            <Row label="Subcontractors invoiced primes" value={formatCents(money.subcontract_invoiced_cents)} />
            <p className="px-4 pt-2 pb-3 text-xs text-muted sm:px-5">
              What contractors invoiced and marked paid. Payments happen outside QuickPro.
            </p>
          </Section>
          <Section title="Reviews and disputes" href="/app/admin/disputes" linkText="Disputes">
            <Row label="Reviews written" value={trust.reviews} />
            <Row label="Average rating" value={trust.avg_rating == null ? "—" : `${trust.avg_rating.toFixed(1)} of 5`} />
            <Row label="Ratings of 2 or less" value={trust.low_ratings} />
            <Row label="Disputes raised" value={trust.disputes_opened} />
            <Row label="Disputes closed" value={trust.disputes_closed} />
            <Row label="Median days to close" value={trust.median_days_to_close == null ? "—" : `${round1(trust.median_days_to_close)} days`} />
            <Row
              label="Open now"
              value={
                trust.disputes_open_now ? (
                  <Link href="/app/admin/disputes" className="text-brand hover:underline">
                    {trust.disputes_open_now}
                  </Link>
                ) : (
                  0
                )
              }
            />
          </Section>
          <Section title="People" href="/app/admin/organizations?status=pending_review" linkText="Review queue">
            <Row label="Approved contractors" value={`${supply.approved_contractors}${added(supply.new_contractors)}`} />
            <Row label="Approved customers" value={`${supply.approved_customers}${added(supply.new_customers)}`} />
            <Row label="Approved workers" value={`${supply.approved_workers}${added(supply.new_workers)}`} />
            <Row label="Awaiting staff review" value={supply.pending_reviews} />
            <p className="px-4 pt-2 pb-3 text-xs text-muted sm:px-5">
              Counts are as of now; &ldquo;new&rdquo; means approved in the period.
              {scope.category ? ` Contractors offering ${scope.category.name.toLowerCase()} only.` : ""}
            </p>
          </Section>
          <CoverageGaps gaps={m.gaps} />
        </div>

        <Breakdowns m={m} narrowed={!!scope.category} />

        <details className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink-soft sm:px-5">
          <summary className="cursor-pointer font-medium text-ink">How these are counted</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Projects count by when the customer posted them; awards and award value by when the customer accepted a quote.</li>
            <li>Shifts count when they started, cancelled shifts left out. A position is filled by an accepted booking.</li>
            <li>Check-ins are those recorded in QuickPro on shifts that have ended.</li>
            <li>Billing is what contractors invoiced customers (voided invoices left out) and what they marked paid.</li>
            <li>Reviews hidden by staff are left out. Disputes count by when they were raised and closed.</li>
            <li>Everything is live from the database as of {formatDateTime(m.generated_at)}. Weeks start on Monday, New York time.</li>
          </ul>
        </details>
      </div>
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card>
      <div className="px-4 py-3.5 sm:px-5">
        <p className="text-xs font-medium tracking-wide text-faint uppercase">{label}</p>
        <p className="tabular mt-1 text-xl font-semibold text-ink sm:text-2xl">{value}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted">{note}</p>
      </div>
    </Card>
  );
}

function Section({ title, href, linkText, children }: { title: string; href: string; linkText: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <Link href={href} className="text-[13px] font-medium text-brand hover:underline">
            {linkText} →
          </Link>
        }
      />
      <dl className="divide-y divide-line" data-testid={`analytics-${title.toLowerCase().split(" ")[0]}`}>
        {children}
      </dl>
    </Card>
  );
}

function Row({ label, value, hint, meter }: { label: string; value: ReactNode; hint?: string; meter?: [number, number] }) {
  return (
    <div className="px-4 py-2.5 sm:px-5">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="tabular text-right text-sm font-medium text-ink">{value}</dd>
      </div>
      {meter && meter[1] > 0 ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (meter[0] / meter[1]) * 100)}%` }} />
        </div>
      ) : null}
      {hint ? <p className="mt-0.5 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

function CoverageGaps({ gaps }: { gaps: MarketAnalytics["gaps"] }) {
  return (
    <Card>
      <CardHeader title="Coverage gaps" description="Customers asked, and no approved contractor covers both the category and the town." />
      {gaps.length ? (
        <ul className="divide-y divide-line" data-testid="coverage-gaps">
          {gaps.map((g) => (
            <li key={`${g.category_id}-${g.area_id}`} className="flex items-baseline justify-between gap-4 px-4 py-2.5 sm:px-5" data-testid="coverage-gap">
              <span className="min-w-0 text-sm text-ink">
                {g.category_name} <span className="text-muted">in</span> {g.area_name}
              </span>
              <span className="tabular shrink-0 text-right text-[13px] text-muted">
                {g.requests} {plural(g.requests, "request")}
                {g.unquoted ? <span className="text-warn"> · {g.unquoted} unquoted</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <CardBody>
          <EmptyState title="No gaps">Every request in this period had an approved contractor covering its category and town.</EmptyState>
        </CardBody>
      )}
    </Card>
  );
}

function Breakdowns({ m, narrowed }: { m: MarketAnalytics; narrowed: boolean }) {
  const busy = (a: AreaRow) => a.requests + a.positions + a.contractors + a.workers > 0;
  const towns = m.areas.filter(busy).sort((a, b) => b.requests + b.positions - (a.requests + a.positions) || a.name.localeCompare(b.name));
  const quiet = m.areas.filter((a) => !busy(a));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="By category" description="Projects posted, award value and shift positions in the period." />
        <ul className="divide-y divide-line md:hidden">
          {m.categories.map((c) => (
            <li key={c.id} className="px-4 py-3" data-testid="category-row">
              <p className="font-medium text-ink">{c.name}</p>
              <p className="tabular mt-0.5 text-[13px] text-muted">
                {c.requests} {plural(c.requests, "project")} · {c.quoted} quoted · {formatCents(c.awarded_cents)} awarded
              </p>
              <p className="tabular text-[13px] text-muted">
                {filledText(c.filled, c.positions)} · {c.contractors} {plural(c.contractors, "contractor")}
              </p>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
          <Table label="By category">
            <THead>
              <Th>Category</Th>
              <Th align="right">Projects</Th>
              <Th align="right">Awarded</Th>
              <Th align="right">Fill rate</Th>
              <Th align="right">Contractors</Th>
            </THead>
            <TBody>
              {m.categories.map((c) => (
                <Tr key={c.id} testId="category-row">
                  <Td className="font-medium text-ink">{c.name}</Td>
                  <Td align="right" className="tabular">
                    {c.requests}
                    <span className="block text-xs text-faint">{c.quoted} quoted</span>
                  </Td>
                  <Td align="right" className="tabular">{formatCents(c.awarded_cents)}</Td>
                  <Td align="right" className="tabular">
                    {pct(c.filled, c.positions)}
                    <span className="block text-xs text-faint">
                      {c.filled}/{c.positions}
                    </span>
                  </Td>
                  <Td align="right" className="tabular">{c.contractors}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>
      <Card>
        <CardHeader
          title="By town"
          description={`Busiest first. Contractors and workers are approved and cover the town${narrowed ? "; contractors offer this category" : ""}.`}
        />
        <ul className="divide-y divide-line md:hidden">
          {towns.map((a) => (
            <li key={a.id} className="px-4 py-3" data-testid="town-row">
              <p className="flex items-center gap-2 font-medium text-ink">
                {a.name} {a.requests > 0 && a.contractors === 0 ? <Badge tone="warn">No contractor</Badge> : null}
              </p>
              <p className="tabular mt-0.5 text-[13px] text-muted">
                {a.requests} {plural(a.requests, "project")} · {filledText(a.filled, a.positions)}
              </p>
              <p className="tabular text-[13px] text-muted">
                {a.contractors} {plural(a.contractors, "contractor")} · {a.workers} {plural(a.workers, "worker")}
              </p>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
          <Table label="By town">
            <THead>
              <Th>Town</Th>
              <Th align="right">Projects</Th>
              <Th align="right">Fill rate</Th>
              <Th align="right">Contractors</Th>
              <Th align="right">Workers</Th>
            </THead>
            <TBody>
              {towns.map((a) => (
                <Tr key={a.id} testId="town-row">
                  <Td className="font-medium text-ink">
                    <span className="flex items-center gap-2">
                      {a.name} {a.requests > 0 && a.contractors === 0 ? <Badge tone="warn">No contractor</Badge> : null}
                    </span>
                  </Td>
                  <Td align="right" className="tabular">
                    {a.requests}
                    <span className="block text-xs text-faint">{a.quoted} quoted</span>
                  </Td>
                  <Td align="right" className="tabular">
                    {pct(a.filled, a.positions)}
                    <span className="block text-xs text-faint">
                      {a.filled}/{a.positions}
                    </span>
                  </Td>
                  <Td align="right" className="tabular">{a.contractors}</Td>
                  <Td align="right" className="tabular">{a.workers}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
        {towns.length === 0 ? (
          <CardBody>
            <EmptyState title="No activity yet">No projects, shifts, contractors or workers in any town for this view.</EmptyState>
          </CardBody>
        ) : null}
        {quiet.length ? (
          <p className="border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5" data-testid="quiet-towns">
            No projects, shifts, contractors or workers yet: {quiet.map((a) => a.name).join(", ")}.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function Amount({ cents, count, bad }: { cents: number; count: number; bad?: boolean }) {
  return (
    <>
      <span className={bad ? "text-bad" : undefined}>{formatCents(cents)}</span>
      <span className="ml-1.5 text-xs font-normal text-faint">
        {count} {plural(count, "invoice")}
      </span>
    </>
  );
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
const share = (part: number, whole: number, before: string, after = "") => (whole ? `${before}${pct(part, whole)}${after}` : "");
const round1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");
const filledText = (filled: number, positions: number) => (positions ? `${pct(filled, positions)} filled (${filled}/${positions})` : "no shifts");
const added = (n: number) => (n ? ` · ${n} new` : "");

function duration(h: number | null) {
  if (h == null) return "—";
  if (h < 1) return "Under an hour";
  if (h < 48) return `${Math.round(h)} hours`;
  return `${round1(h / 24)} days`;
}

function hours(h: number) {
  return `${Math.round(h).toLocaleString("en-US")} ${Math.round(h) === 1 ? "hour" : "hours"}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function columns(trend: TrendBucket[], bucket: "week" | "month", part: "filled" | "awarded", total: "positions" | "requests"): ActivityColumn[] {
  return trend.map((b) => {
    const [y, mo, d] = b.starts.split("-").map(Number);
    const label = bucket === "week" ? `${MONTHS[mo - 1]} ${d}` : MONTHS[mo - 1];
    const title = bucket === "week" ? `Week of ${MONTHS[mo - 1]} ${d}, ${y}` : `${MONTHS_LONG[mo - 1]} ${y}`;
    return { label, title, part: b[part], total: b[total] };
  });
}
