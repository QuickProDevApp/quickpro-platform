import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { getMarketAnalytics, resolveAnalyticsScope } from "@/server/data/analytics";

/**
 * The analytics breakdowns as a CSV file for staff: one row for the whole
 * market, then one per category and one per town, for the same period,
 * market and category as the page.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  // Not found rather than forbidden, like the staff pages.
  if (!user?.isAdmin) return new NextResponse("Not found", { status: 404 });

  const q = request.nextUrl.searchParams;
  const scope = await resolveAnalyticsScope(user.id, {
    days: q.get("days") ?? undefined,
    market: q.get("market") ?? undefined,
    category: q.get("category") ?? undefined,
  });
  const m = await getMarketAnalytics(user.id, scope.filter);
  const header = [
    "breakdown",
    "name",
    "projects_posted",
    "projects_quoted",
    "awarded_usd",
    "shift_positions",
    "positions_filled",
    "fill_rate_pct",
    "approved_contractors",
    "approved_workers",
  ];
  const rate = (filled: number, positions: number) => (positions ? Math.round((filled / positions) * 1000) / 10 : "");
  const usd = (cents: number) => (cents / 100).toFixed(2);
  const rows: (string | number)[][] = [
    [
      "market",
      scope.market.name,
      m.projects.posted,
      m.projects.quoted,
      usd(m.projects.awarded_cents),
      m.shifts.positions,
      m.shifts.filled,
      rate(m.shifts.filled, m.shifts.positions),
      m.supply.approved_contractors,
      m.supply.approved_workers,
    ],
    ...(scope.category ? [] : m.categories).map((c) => [
      "category",
      c.name,
      c.requests,
      c.quoted,
      usd(c.awarded_cents),
      c.positions,
      c.filled,
      rate(c.filled, c.positions),
      c.contractors,
      "",
    ]),
    ...m.areas.map((a) => ["town", a.name, a.requests, a.quoted, "", a.positions, a.filled, rate(a.filled, a.positions), a.contractors, a.workers]),
  ];
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  const stamp = m.generated_at.toISOString().slice(0, 10);
  const name = `quickpro-${scope.market.slug}${scope.category ? `-${scope.category.slug}` : ""}-${scope.filter.days}d-${stamp}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Quotes a CSV cell, and stops spreadsheet apps reading text as a formula. */
function cell(value: string | number) {
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
