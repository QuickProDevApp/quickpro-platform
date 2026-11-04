import { NextResponse, type NextRequest } from "next/server";
import { uuid } from "@/lib/schemas";
import { getCurrentUser } from "@/server/auth/session";
import { refreshPayoutAccount } from "@/server/payments";

/** Back from Stripe's onboarding: read the account's state from Stripe (D-040). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const user = await getCurrentUser();
  const { orgId } = await params;
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.url));
  if (!uuid.safeParse(orgId).success) return new NextResponse("Not found", { status: 404 });
  let outcome = "returned";
  try {
    await refreshPayoutAccount(user.id, orgId);
  } catch (error) {
    console.error("Payout account refresh failed", error);
    outcome = "failed";
  }
  return NextResponse.redirect(new URL(`/app/org/${orgId}/payments?setup=${outcome}`, request.url));
}
