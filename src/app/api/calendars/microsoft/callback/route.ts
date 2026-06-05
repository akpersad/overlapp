import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, MS_OAUTH_STATE_COOKIE } from "@/lib/microsoft/oauth";
import { saveConnection, syncCalendar } from "@/lib/calendar/sync";

// Microsoft OAuth callback — the Google twin. Validates the CSRF state,
// exchanges the code for tokens, persists the connection (service role), kicks
// off a first sync, and returns the user to /calendars.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const back = (qs: string) => NextResponse.redirect(new URL(`/calendars?${qs}`, request.url));

  if (error) return back(`error=${encodeURIComponent(error)}`);
  if (!code || !state) return back("error=missing_code");

  // CSRF: the state must match the cookie we set when starting the flow.
  const cookieState = request.cookies.get(MS_OAUTH_STATE_COOKIE)?.value;
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
    const calendarId = await saveConnection(admin, user.id, "microsoft", tokens);
    await syncCalendar(calendarId);
  } catch (err) {
    console.error("[microsoft-connect] failed:", err);
    return back("error=connect_failed");
  }

  const res = back("connected=1");
  res.cookies.delete(MS_OAUTH_STATE_COOKIE);
  return res;
}
