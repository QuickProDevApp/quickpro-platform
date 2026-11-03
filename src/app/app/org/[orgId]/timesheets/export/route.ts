import { NextResponse, type NextRequest } from "next/server";
import { marketToday, resolveWeek } from "@/lib/schedule";
import { grossCents, localInputValue } from "@/lib/timesheets";
import { uuid } from "@/lib/schemas";
import { getCurrentUser } from "@/server/auth/session";
import { listOrgTimesheets } from "@/server/data/timesheets";

/**
 * A week of approved hours as a CSV file for the business's own payroll
 * (D-038). Members of the business and staff only; the database checks.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  const { orgId } = await params;
  if (!uuid.safeParse(orgId).success) return new NextResponse("Not found", { status: 404 });
  const week = resolveWeek(request.nextUrl.searchParams.get("week") ?? undefined, marketToday());

  let rows;
  try {
    rows = await listOrgTimesheets(user.id, orgId, week.start, week.end);
  } catch (error) {
    if ((error as { code?: string }).code === "P0002") return new NextResponse("Not found", { status: 404 });
    throw error;
  }
  const approved = rows.filter((r) => r.status === "approved" && r.started_at && r.ended_at && r.worked_minutes != null);
  const header = ["date", "worker", "job", "start", "end", "break_minutes", "hours", "rate_usd", "gross_usd", "note"];
  const body = approved.map((r) => [
    r.local_date,
    r.worker_name,
    r.job_title,
    localInputValue(r.started_at!).replace("T", " "),
    localInputValue(r.ended_at!).replace("T", " "),
    r.break_minutes ?? 0,
    (r.worked_minutes! / 60).toFixed(2),
    (r.pay_rate_cents / 100).toFixed(2),
    (grossCents(r.worked_minutes!, r.pay_rate_cents) / 100).toFixed(2),
    r.adjust_note ?? "",
  ]);
  const csv = [header, ...body].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="approved-hours-${week.start}.csv"`,
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
