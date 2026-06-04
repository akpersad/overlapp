import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/supabase/database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Next.js 16 renamed `middleware` → `proxy` (middleware.ts / export function
// middleware are deprecated). This runs on the Node.js runtime only.
//
// Responsibilities:
//   1. Refresh the Supabase auth session cookie on every matched request so
//      Server Components always see a fresh session.
//   2. Gate routes — only the public paths below are reachable signed-out;
//      everything else redirects to /login.
//
// SECURITY NOTE: per the Next.js 16 docs, the proxy is not a hard security
// boundary (a refactor can silently drop coverage, and Server Actions aren't in
// the matcher chain). RLS in Postgres is the real guard; always re-check auth
// inside Server Actions / Route Handlers too. This gating is for UX/redirects.

// Paths reachable without a session. Matched as prefixes. Auth + invite-preview
// routes get added here as they're built (see DATA-MODEL.md §4 invite preview).
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/verify-email",
  "/auth",
  "/invite",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true; // landing page
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  // Start with a pass-through response we can attach refreshed cookies to.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser — it
  // refreshes the session, and intervening logic risks hard-to-debug bugs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static assets. Keeping the
    // session fresh on every navigable route is the point — exclude only files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
