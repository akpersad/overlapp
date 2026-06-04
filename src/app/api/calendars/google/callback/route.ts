import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, OAUTH_STATE_COOKIE } from "@/lib/google/oauth";
import { saveGoogleConnection, syncCalendar } from "@/lib/google/sync";

// Google OAuth callback. Validates the CSRF state, exchanges the code for
// tokens, persists the connection (service role), kicks off a first sync, and
// returns the user to /calendars. Mirrors the auth/confirm route handler shape.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const back = (qs: string) => NextResponse.redirect(new URL(`/calendars?${qs}`, request.url));

  if (error) return back(`error=${encodeURIComponent(error)}`);
  if (!code || !state) return back("error=missing_code");

  // CSRF: the state must match the cookie we set when starting the flow.
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!cookieState || cookieState !== state) return back("error=bad_state");

  // Must be signed in to attach the calendar to an account.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  try {
    const tokens = await exchangeCode(code);
    const admin = createAdminClient();
    const calendarId = await saveGoogleConnection(admin, user.id, tokens);
    await syncCalendar(calendarId);
  } catch {
    return back("error=connect_failed");
  } finally {
    // One-shot state — clear it regardless of outcome.
  }

  const res = back("connected=1");
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
