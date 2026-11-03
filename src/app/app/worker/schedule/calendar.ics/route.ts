import { NextResponse } from "next/server";
import { buildCalendar } from "@/lib/ics";
import { getCurrentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { listBookedShiftsForCalendar } from "@/server/data/schedule";

/**
 * The signed-in worker's booked shifts for the next 90 days as a calendar
 * file. A one-time download, not a subscription: nothing is shared and no
 * link works without signing in.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not found", { status: 404 });
  const shifts = await listBookedShiftsForCalendar(user.id);
  const site = env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const body = buildCalendar(
    "QuickPro shifts",
    shifts.map((s) => ({
      uid: `${s.assignment_id}@quickpro`,
      start: s.starts_at,
      end: s.ends_at,
      summary: `${s.title} (${s.organization_name ?? "QuickPro"})`,
      location: s.address_line1
        ? [s.address_line1, [s.city, s.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")
        : s.area_name,
      description: `Booked through QuickPro. Details and check-in: ${site}/app/worker/jobs/${s.job_id}`,
    })),
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="quickpro-shifts.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
