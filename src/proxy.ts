import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors away from /app. This is a convenience redirect only: every page,
 * server action and route handler checks the user again on the server.
 */
export async function proxy(request: NextRequest) {
  if (process.env.QUICKPRO_SHOWCASE === "on") return showcase(request);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/app")) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * The presentation preview (D-047). No Supabase client is created: nobody
 * signs in and nothing reads the database. The public directory addresses
 * show the sample directory, sign-up links lead to the matching sample
 * screen, and every account, app and API route is closed.
 */
function showcase(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const to = (path: string, rewrite = false) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    if (!rewrite) url.search = "";
    return rewrite ? NextResponse.rewrite(url) : NextResponse.redirect(url);
  };
  if (pathname === "/contractors" || pathname.startsWith("/contractors/")) return to(`/showcase${pathname}`, true);
  if (pathname === "/sign-up") {
    const as = searchParams.get("as");
    return to(as === "customer" ? "/showcase/post-a-project" : as === "worker" ? "/showcase/dashboard/worker" : as === "contractor" ? "/showcase/dashboard/contractor" : "/showcase");
  }
  if (pathname.startsWith("/api/")) return new NextResponse("Not available in the presentation preview.", { status: 404 });
  if (/^\/(app|auth|sign-in|check-email|forgot-password|reset-password|onboarding|invite)(\/|$)/.test(pathname)) return to("/showcase");
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
