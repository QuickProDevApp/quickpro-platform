import "server-only";
import { withUser } from "@/server/db/client";
import type { Tx } from "@/server/db/rls";

// Market and category numbers for QuickPro staff. Everything is computed from
// the live tables as the signed-in staff member (row level security lets
// staff read every row); nothing here is sampled, cached or estimated.
//
// Definitions, kept here so the page and the docs agree:
// - A period is the last 7, 30, 90 or 365 days up to now.
// - Projects count by when the request was posted; awards and award value by
//   when the customer accepted the quote.
// - Shifts count jobs that have started within the period and were not
//   cancelled. A position is filled by an accepted (or completed) booking.
//   "Time to fill" runs from posting to the booking that filled the last
//   position, for jobs that filled completely.
// - Attendance is bookings on shifts that have ended with a check-in recorded.
// - Invoices are customer billing (project invoices). Amounts are what
//   contractors invoiced and marked paid; QuickPro doesn't move money.
// - Reviews and disputes count by when they were written or raised.

export const ANALYTICS_PERIODS = [7, 30, 90, 365] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export type AnalyticsFilter = { days: AnalyticsPeriod; marketId: string; categoryId?: string | null };

export type ProjectMetrics = {
  posted: number;
  quoted: number;
  median_hours_to_quote: number | null;
  awarded_of_posted: number;
  cancelled_of_posted: number;
  awarded: number;
  awarded_cents: number;
  completed: number;
};

export type ShiftMetrics = {
  jobs: number;
  positions: number;
  filled: number;
  fully_staffed: number;
  median_hours_to_fill: number | null;
  ended_bookings: number;
  checked_in: number;
  hours_recorded: number;
};

export type MoneyMetrics = {
  invoiced_count: number;
  invoiced_cents: number;
  paid_count: number;
  paid_cents: number;
  median_days_to_pay: number | null;
  outstanding_count: number;
  outstanding_cents: number;
  overdue_count: number;
  overdue_cents: number;
  subcontract_invoiced_cents: number;
};

export type TrustMetrics = {
  reviews: number;
  avg_rating: number | null;
  low_ratings: number;
  disputes_opened: number;
  disputes_closed: number;
  disputes_open_now: number;
  median_days_to_close: number | null;
};

export type SupplyMetrics = {
  approved_contractors: number;
  approved_customers: number;
  approved_workers: number;
  new_contractors: number;
  new_customers: number;
  new_workers: number;
  pending_reviews: number;
};

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  requests: number;
  quoted: number;
  awarded_cents: number;
  positions: number;
  filled: number;
  contractors: number;
};

export type AreaRow = {
  id: string;
  slug: string;
  name: string;
  requests: number;
  quoted: number;
  positions: number;
  filled: number;
  contractors: number;
  workers: number;
};

export type CoverageGap = {
  category_id: string;
  category_name: string;
  area_id: string;
  area_name: string;
  requests: number;
  unquoted: number;
};

export type TrendBucket = {
  starts: string; // YYYY-MM-DD, New York
  requests: number;
  awarded: number;
  positions: number;
  filled: number;
};

export type MarketAnalytics = {
  filter: AnalyticsFilter;
  bucket: "week" | "month";
  generated_at: Date;
  projects: ProjectMetrics;
  shifts: ShiftMetrics;
  money: MoneyMetrics;
  trust: TrustMetrics;
  supply: SupplyMetrics;
  categories: CategoryRow[];
  areas: AreaRow[];
  gaps: CoverageGap[];
  trend: TrendBucket[];
};

export function isAnalyticsPeriod(n: number): n is AnalyticsPeriod {
  return (ANALYTICS_PERIODS as readonly number[]).includes(n);
}

/** Every metric for one market and period, optionally narrowed to one category. Staff only. */
export async function getMarketAnalytics(adminId: string, filter: AnalyticsFilter): Promise<MarketAnalytics> {
  if (!isAnalyticsPeriod(filter.days)) throw new Error("Unsupported period");
  return withUser(adminId, async (tx) => {
    const [{ ok }] = await tx<{ ok: boolean }[]>`select app.is_admin() as ok`;
    if (!ok) throw new Error("Not found");
    const ctx = {
      market: filter.marketId,
      category: filter.categoryId ?? null,
      days: filter.days,
    };
    const bucket = filter.days > 90 ? "month" : "week";
    const [projects, shifts, money, trust, supply, categories, areas, gaps, trend, [{ now }]] = await Promise.all([
      projectMetrics(tx, ctx),
      shiftMetrics(tx, ctx),
      moneyMetrics(tx, ctx),
      trustMetrics(tx, ctx),
      supplyMetrics(tx, ctx),
      categoryRows(tx, ctx),
      areaRows(tx, ctx),
      coverageGaps(tx, ctx),
      trendBuckets(tx, ctx, bucket),
      tx<{ now: Date }[]>`select now() as now`,
    ]);
    return { filter, bucket, generated_at: now, projects, shifts, money, trust, supply, categories, areas, gaps, trend };
  });
}

type Ctx = { market: string; category: string | null; days: number };

async function projectMetrics(tx: Tx, c: Ctx) {
  const [row] = await tx<ProjectMetrics[]>`
    with r as (
      select r.created_at, r.awarded_at, r.completed_at, r.status,
             (select min(q.created_at) from public.quotes q where q.request_id = r.id) as first_quote_at,
             (select q.amount_cents from public.quotes q where q.id = r.awarded_quote_id) as awarded_cents
      from public.service_requests r
      join public.service_areas a on a.id = r.service_area_id
      where a.market_id = ${c.market} and (${c.category}::uuid is null or r.category_id = ${c.category}::uuid)
    ), w as (select now() - make_interval(days => ${c.days}) as since)
    select
      count(*) filter (where r.created_at >= w.since)::int as posted,
      count(*) filter (where r.created_at >= w.since and r.first_quote_at is not null)::int as quoted,
      (percentile_cont(0.5) within group (order by extract(epoch from r.first_quote_at - r.created_at) / 3600)
        filter (where r.created_at >= w.since and r.first_quote_at is not null))::float8 as median_hours_to_quote,
      count(*) filter (where r.created_at >= w.since and r.awarded_at is not null)::int as awarded_of_posted,
      count(*) filter (where r.created_at >= w.since and r.status = 'cancelled' and r.awarded_at is null)::int as cancelled_of_posted,
      count(*) filter (where r.awarded_at >= w.since)::int as awarded,
      coalesce(sum(r.awarded_cents) filter (where r.awarded_at >= w.since), 0)::float8 as awarded_cents,
      count(*) filter (where r.completed_at >= w.since)::int as completed
    from r, w
  `;
  return row;
}

/** Jobs in the market (and category) that started in the period and weren't cancelled, with their bookings. */
function startedJobs(tx: Tx, c: Ctx) {
  return tx`
    select j.id, j.category_id, j.service_area_id, j.headcount, j.created_at, j.starts_at, j.ends_at,
           (select count(*) from public.job_assignments x
             where x.job_id = j.id and x.status in ('accepted', 'completed'))::int as booked,
           (select s.responded_at from (
              select x.responded_at, row_number() over (order by x.responded_at) as n
              from public.job_assignments x
              where x.job_id = j.id and x.status in ('accepted', 'completed')
            ) s where s.n = j.headcount) as filled_at
    from public.jobs j
    join public.service_areas a on a.id = j.service_area_id
    where a.market_id = ${c.market}
      and (${c.category}::uuid is null or j.category_id = ${c.category}::uuid)
      and j.status <> 'cancelled'
      and j.starts_at >= now() - make_interval(days => ${c.days})
      and j.starts_at <= now()
  `;
}

async function shiftMetrics(tx: Tx, c: Ctx) {
  const [row] = await tx<ShiftMetrics[]>`
    with j as (${startedJobs(tx, c)}),
    b as (
      select x.checked_in_at, x.checked_out_at
      from public.job_assignments x join j on j.id = x.job_id
      where x.status in ('accepted', 'completed') and j.ends_at <= now()
    )
    select
      (select count(*) from j)::int as jobs,
      (select coalesce(sum(headcount), 0) from j)::int as positions,
      (select coalesce(sum(least(booked, headcount)), 0) from j)::int as filled,
      (select count(*) from j where booked >= headcount)::int as fully_staffed,
      (select percentile_cont(0.5) within group (order by extract(epoch from filled_at - created_at) / 3600)
         from j where filled_at is not null)::float8 as median_hours_to_fill,
      (select count(*) from b)::int as ended_bookings,
      (select count(*) from b where checked_in_at is not null)::int as checked_in,
      (select coalesce(sum(extract(epoch from x.checked_out_at - x.checked_in_at)) / 3600, 0)
         from public.job_assignments x join j on j.id = x.job_id
         where x.status in ('accepted', 'completed') and x.checked_out_at is not null)::float8 as hours_recorded
  `;
  return row;
}

async function moneyMetrics(tx: Tx, c: Ctx) {
  const [row] = await tx<MoneyMetrics[]>`
    with i as (
      select i.context, i.status, i.total_cents, i.issued_at, i.issue_date, i.paid_at, i.paid_on, i.due_date
      from public.invoices i
      join public.service_requests r on r.id = i.request_id
      join public.service_areas a on a.id = r.service_area_id
      where a.market_id = ${c.market} and (${c.category}::uuid is null or r.category_id = ${c.category}::uuid)
        and i.status <> 'draft'
    ), w as (
      select now() - make_interval(days => ${c.days}) as since,
             (now() at time zone 'America/New_York')::date as today
    )
    select
      count(*) filter (where context = 'project' and status <> 'void' and issued_at >= w.since)::int as invoiced_count,
      coalesce(sum(total_cents) filter (where context = 'project' and status <> 'void' and issued_at >= w.since), 0)::float8 as invoiced_cents,
      count(*) filter (where context = 'project' and status = 'paid' and paid_at >= w.since)::int as paid_count,
      coalesce(sum(total_cents) filter (where context = 'project' and status = 'paid' and paid_at >= w.since), 0)::float8 as paid_cents,
      (percentile_cont(0.5) within group (order by paid_on - issue_date)
        filter (where context = 'project' and status = 'paid' and paid_at >= w.since))::float8 as median_days_to_pay,
      count(*) filter (where context = 'project' and status = 'issued')::int as outstanding_count,
      coalesce(sum(total_cents) filter (where context = 'project' and status = 'issued'), 0)::float8 as outstanding_cents,
      count(*) filter (where context = 'project' and status = 'issued' and due_date < w.today)::int as overdue_count,
      coalesce(sum(total_cents) filter (where context = 'project' and status = 'issued' and due_date < w.today), 0)::float8 as overdue_cents,
      coalesce(sum(total_cents) filter (where context = 'subcontract' and status <> 'void' and issued_at >= w.since), 0)::float8
        as subcontract_invoiced_cents
    from i, w
  `;
  return row;
}

/** Where a review or dispute's work happened: the project's request, or the shift's job. */
function workPlace(tx: Tx, table: "reviews" | "disputes") {
  return tx`
    select t.*, coalesce(rq.service_area_id, j.service_area_id) as area_id, coalesce(rq.category_id, j.category_id) as cat_id
    from ${tx(`public.${table}`)} t
    left join public.subcontracts s on s.id = t.subcontract_id
    left join public.service_requests rq on rq.id = coalesce(t.request_id, s.request_id)
    left join public.job_assignments x on x.id = t.assignment_id
    left join public.jobs j on j.id = x.job_id
  `;
}

async function trustMetrics(tx: Tx, c: Ctx) {
  const [row] = await tx<TrustMetrics[]>`
    with v as (${workPlace(tx, "reviews")}),
    d as (${workPlace(tx, "disputes")}),
    w as (select now() - make_interval(days => ${c.days}) as since),
    places as (select id from public.service_areas where market_id = ${c.market})
    select
      (select count(*) from v, w where v.created_at >= w.since and v.hidden_at is null
         and v.area_id in (select id from places) and (${c.category}::uuid is null or v.cat_id = ${c.category}::uuid))::int as reviews,
      (select avg(v.rating) from v, w where v.created_at >= w.since and v.hidden_at is null
         and v.area_id in (select id from places) and (${c.category}::uuid is null or v.cat_id = ${c.category}::uuid))::float8 as avg_rating,
      (select count(*) from v, w where v.created_at >= w.since and v.hidden_at is null and v.rating <= 2
         and v.area_id in (select id from places) and (${c.category}::uuid is null or v.cat_id = ${c.category}::uuid))::int as low_ratings,
      (select count(*) from d, w where d.created_at >= w.since
         and d.area_id in (select id from places) and (${c.category}::uuid is null or d.cat_id = ${c.category}::uuid))::int as disputes_opened,
      (select count(*) from d, w where coalesce(d.resolved_at, d.withdrawn_at) >= w.since
         and d.area_id in (select id from places) and (${c.category}::uuid is null or d.cat_id = ${c.category}::uuid))::int as disputes_closed,
      (select count(*) from d where d.status = 'open'
         and d.area_id in (select id from places) and (${c.category}::uuid is null or d.cat_id = ${c.category}::uuid))::int as disputes_open_now,
      (select percentile_cont(0.5) within group (order by extract(epoch from coalesce(d.resolved_at, d.withdrawn_at) - d.created_at) / 86400)
         from d, w where coalesce(d.resolved_at, d.withdrawn_at) >= w.since
         and d.area_id in (select id from places) and (${c.category}::uuid is null or d.cat_id = ${c.category}::uuid))::float8 as median_days_to_close
  `;
  return row;
}

async function supplyMetrics(tx: Tx, c: Ctx) {
  const [row] = await tx<SupplyMetrics[]>`
    with w as (select now() - make_interval(days => ${c.days}) as since),
    contractors as (
      select o.* from public.organizations o
      where o.kind = 'contractor' and o.market_id = ${c.market}
        and (${c.category}::uuid is null
             or exists (select 1 from public.contractor_services cs where cs.organization_id = o.id and cs.category_id = ${c.category}::uuid))
    ),
    workers as (
      select wp.* from public.worker_profiles wp
      where wp.home_service_area_id in (select id from public.service_areas where market_id = ${c.market})
         or exists (select 1 from public.worker_service_areas wa join public.service_areas a on a.id = wa.service_area_id
                     where wa.user_id = wp.user_id and a.market_id = ${c.market})
    )
    select
      (select count(*) from contractors where status = 'approved')::int as approved_contractors,
      (select count(*) from public.organizations where kind = 'customer' and market_id = ${c.market} and status = 'approved')::int
        as approved_customers,
      (select count(*) from workers where status = 'approved')::int as approved_workers,
      (select count(*) from contractors, w where status = 'approved' and reviewed_at >= w.since)::int as new_contractors,
      (select count(*) from public.organizations o, w where o.kind = 'customer' and o.market_id = ${c.market}
         and o.status = 'approved' and o.reviewed_at >= w.since)::int as new_customers,
      (select count(*) from workers, w where status = 'approved' and reviewed_at >= w.since)::int as new_workers,
      ((select count(*) from contractors where status = 'pending_review')
        + (select count(*) from workers where status = 'pending_review'))::int as pending_reviews
  `;
  return row;
}

async function categoryRows(tx: Tx, c: Ctx) {
  return tx<CategoryRow[]>`
    with w as (select now() - make_interval(days => ${c.days}) as since),
    j as (${startedJobs(tx, { ...c, category: null })}),
    r as (
      select r.category_id,
             exists (select 1 from public.quotes q where q.request_id = r.id) as quoted
      from public.service_requests r join public.service_areas a on a.id = r.service_area_id, w
      where a.market_id = ${c.market} and r.created_at >= w.since
    ),
    awards as (
      select r.category_id, sum(q.amount_cents) as cents
      from public.service_requests r
      join public.service_areas a on a.id = r.service_area_id
      join public.quotes q on q.id = r.awarded_quote_id, w
      where a.market_id = ${c.market} and r.awarded_at >= w.since
      group by r.category_id
    )
    select sc.id, sc.slug, sc.name,
           (select count(*) from r where r.category_id = sc.id)::int as requests,
           (select count(*) from r where r.category_id = sc.id and r.quoted)::int as quoted,
           coalesce((select cents from awards where awards.category_id = sc.id), 0)::float8 as awarded_cents,
           (select coalesce(sum(headcount), 0) from j where j.category_id = sc.id)::int as positions,
           (select coalesce(sum(least(booked, headcount)), 0) from j where j.category_id = sc.id)::int as filled,
           (select count(*) from public.organizations o join public.contractor_services cs on cs.organization_id = o.id
             where cs.category_id = sc.id and o.kind = 'contractor' and o.status = 'approved' and o.market_id = ${c.market})::int
             as contractors
    from public.service_categories sc
    where sc.is_active
    order by sc.sort_order, sc.name
  `;
}

async function areaRows(tx: Tx, c: Ctx) {
  return tx<AreaRow[]>`
    with w as (select now() - make_interval(days => ${c.days}) as since),
    j as (${startedJobs(tx, c)}),
    r as (
      select r.service_area_id, exists (select 1 from public.quotes q where q.request_id = r.id) as quoted
      from public.service_requests r, w
      where r.created_at >= w.since and (${c.category}::uuid is null or r.category_id = ${c.category}::uuid)
    )
    select a.id, a.slug, a.name,
           (select count(*) from r where r.service_area_id = a.id)::int as requests,
           (select count(*) from r where r.service_area_id = a.id and r.quoted)::int as quoted,
           (select coalesce(sum(headcount), 0) from j where j.service_area_id = a.id)::int as positions,
           (select coalesce(sum(least(booked, headcount)), 0) from j where j.service_area_id = a.id)::int as filled,
           (select count(*) from public.organizations o join public.contractor_service_areas ca on ca.organization_id = o.id
             where ca.service_area_id = a.id and o.kind = 'contractor' and o.status = 'approved'
               and (${c.category}::uuid is null
                    or exists (select 1 from public.contractor_services cs where cs.organization_id = o.id and cs.category_id = ${c.category}::uuid)))::int
             as contractors,
           (select count(*) from public.worker_profiles wp
             where wp.status = 'approved'
               and (wp.home_service_area_id = a.id
                    or exists (select 1 from public.worker_service_areas wa where wa.user_id = wp.user_id and wa.service_area_id = a.id)))::int
             as workers
    from public.service_areas a
    where a.market_id = ${c.market}
    order by a.name
  `;
}

/** Category and town pairs where customers asked in the period but no approved contractor covers both. */
async function coverageGaps(tx: Tx, c: Ctx) {
  return tx<CoverageGap[]>`
    with w as (select now() - make_interval(days => ${c.days}) as since)
    select sc.id as category_id, sc.name as category_name, a.id as area_id, a.name as area_name,
           count(*)::int as requests,
           count(*) filter (where not exists (select 1 from public.quotes q where q.request_id = r.id))::int as unquoted
    from public.service_requests r
    join public.service_areas a on a.id = r.service_area_id
    join public.service_categories sc on sc.id = r.category_id, w
    where a.market_id = ${c.market} and r.created_at >= w.since
      and (${c.category}::uuid is null or r.category_id = ${c.category}::uuid)
      and not exists (
        select 1 from public.organizations o
        join public.contractor_services cs on cs.organization_id = o.id and cs.category_id = r.category_id
        join public.contractor_service_areas ca on ca.organization_id = o.id and ca.service_area_id = r.service_area_id
        where o.kind = 'contractor' and o.status = 'approved'
      )
    group by sc.id, sc.name, sc.sort_order, a.id, a.name
    order by count(*) desc, sc.sort_order, a.name
    limit 20
  `;
}

/** Weekly (or monthly, for a year) activity in New York time, oldest first. */
async function trendBuckets(tx: Tx, c: Ctx, bucket: "week" | "month") {
  const step = bucket === "week" ? "1 week" : "1 month";
  return tx<TrendBucket[]>`
    with b as (
      select g as starts, g + ${step}::interval as stops
      from generate_series(
        date_trunc(${bucket}, (now() - make_interval(days => ${c.days})) at time zone 'America/New_York'),
        date_trunc(${bucket}, now() at time zone 'America/New_York'),
        ${step}::interval
      ) g
    ),
    r as (
      select r.created_at at time zone 'America/New_York' as at, r.awarded_at is not null as awarded
      from public.service_requests r join public.service_areas a on a.id = r.service_area_id
      where a.market_id = ${c.market} and (${c.category}::uuid is null or r.category_id = ${c.category}::uuid)
    ),
    j as (
      select j.starts_at at time zone 'America/New_York' as at, j.headcount,
             least(j.headcount, (select count(*) from public.job_assignments x
                                  where x.job_id = j.id and x.status in ('accepted', 'completed'))) as filled
      from public.jobs j join public.service_areas a on a.id = j.service_area_id
      where a.market_id = ${c.market} and (${c.category}::uuid is null or j.category_id = ${c.category}::uuid)
        and j.status <> 'cancelled' and j.starts_at <= now()
    )
    select to_char(b.starts, 'YYYY-MM-DD') as starts,
           (select count(*) from r where r.at >= b.starts and r.at < b.stops)::int as requests,
           (select count(*) from r where r.at >= b.starts and r.at < b.stops and r.awarded)::int as awarded,
           (select coalesce(sum(headcount), 0) from j where j.at >= b.starts and j.at < b.stops)::int as positions,
           (select coalesce(sum(filled), 0) from j where j.at >= b.starts and j.at < b.stops)::int as filled
    from b
    order by b.starts
  `;
}

export type AnalyticsScope = {
  filter: AnalyticsFilter;
  markets: { id: string; slug: string; name: string; is_active: boolean }[];
  categories: { id: string; slug: string; name: string }[];
  market: { id: string; slug: string; name: string; is_active: boolean };
  category: { id: string; slug: string; name: string } | null;
};

/**
 * Reads the period, market and category from a query string (`days`,
 * `market`, `category` by slug), falling back to the last 30 days in the
 * first open market across all categories.
 */
export async function resolveAnalyticsScope(
  adminId: string,
  query: { days?: string; market?: string; category?: string },
): Promise<AnalyticsScope> {
  const { markets, categories } = await withUser(adminId, async (tx) => ({
    markets: await tx<AnalyticsScope["markets"]>`
      select id, slug, name, is_active from public.markets
      where exists (select 1 from public.service_areas a where a.market_id = markets.id)
      order by is_active desc, name
    `,
    categories: await tx<AnalyticsScope["categories"]>`
      select id, slug, name from public.service_categories where is_active order by sort_order, name
    `,
  }));
  const days = Number(query.days);
  const market = markets.find((m) => m.slug === query.market) ?? markets[0];
  const category = categories.find((c) => c.slug === query.category) ?? null;
  return {
    filter: { days: isAnalyticsPeriod(days) ? days : 30, marketId: market.id, categoryId: category?.id ?? null },
    markets,
    categories,
    market,
    category,
  };
}
