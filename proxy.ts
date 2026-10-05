import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Every route except /login requires a session.
 *
 * GDCMAS is a staff-only back-office app with no public pages, so the whole
 * tree is protected rather than a list of prefixes.
 *
 * NOTE: this is a fast-path redirect only, not the security boundary. Role and
 * `is_active` checks happen in lib/security/session.ts against the `staff`
 * table, and row-level rules are enforced in Postgres. Proxy never trusts
 * client-supplied role data.
 */

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Missing env vars short-circuit to allow, so `next build` and a fresh clone
  // do not crash before .env.local exists.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

  let user: import("@supabase/supabase-js").User | null = null;
  if (hasSessionCookie) {
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!isPublic && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were headed, minus any query string, which may
    // contain a search term for a patient name.
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Deliberately NO "signed-in user hitting /login -> /dashboard" redirect
  // here. Proxy can only see an auth session, not the `staff` row, so it would
  // bounce a deactivated account to /dashboard, whose layout sends them back
  // to /login, forever. app/login/page.tsx resolves the staff row first and
  // only forwards users who are genuinely active.
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};