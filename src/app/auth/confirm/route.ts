import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { markRecoverySession } from "@/server/auth/recovery";
import { safeNextPath } from "@/lib/paths";

/**
 * Landing point for Supabase Auth email links. Handles both the PKCE `code`
 * redirect (default templates) and `token_hash` links (custom templates).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (ok) {
    // A password-reset link: let the reset page set a new password once.
    if (searchParams.get("flow") === "recovery" || type === "recovery") await markRecoverySession();
    return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", origin));
}
