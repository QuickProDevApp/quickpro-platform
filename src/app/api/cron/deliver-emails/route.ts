import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { deliverEmailsSoon } from "@/server/email";
import { env } from "@/server/env";

/**
 * Sends queued notification emails (D-039), for a scheduler. Requires
 * "Authorization: Bearer <CRON_SECRET>"; without CRON_SECRET set it is off.
 */
export async function POST(request: NextRequest) {
  const secret = env().CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok =
    !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new NextResponse("Not found", { status: 404 });
  const result = await deliverEmailsSoon();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
