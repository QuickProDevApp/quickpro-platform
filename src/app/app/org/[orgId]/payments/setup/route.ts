import { NextResponse, type NextRequest } from "next/server";
import { uuid } from "@/lib/schemas";
import { getCurrentUser } from "@/server/auth/session";
import { getMyOrganization } from "@/server/data/organizations";
import { startPayoutSetup } from "@/server/payments";

/**
 * Stripe sends people here when an onboarding link has expired: make a new
 * one and go back to Stripe (D-040). Owners and admins; the database checks.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const user = await getCurrentUser();
  const { orgId } = await params;
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.url));
  if (!uuid.safeParse(orgId).success) return new NextResponse("Not found", { status: 404 });
  const org = await getMyOrganization(user.id, orgId);
  if (!org) return new NextResponse("Not found", { status: 404 });
  try {
    return NextResponse.redirect(await startPayoutSetup(user.id, org.id, org.name, user.email));
  } catch (error) {
    console.error("Payout setup link failed", error);
    return NextResponse.redirect(new URL(`/app/org/${org.id}/payments?setup=failed`, request.url));
  }
}
