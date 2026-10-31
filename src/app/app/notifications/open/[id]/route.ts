import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { openNotification } from "@/server/data/notifications";
import { safeNextPath } from "@/lib/paths";
import { uuid } from "@/lib/schemas";

/** Marks a notification read, then goes where it points. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  const row = parsed.success ? await openNotification(user.id, parsed.data) : null;
  const target = row?.link_path ? safeNextPath(row.link_path, "/app/notifications") : "/app/notifications";
  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
