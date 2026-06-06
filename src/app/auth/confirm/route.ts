import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

// Email-confirmation / magic-link callback (used when email confirmations are
// enabled in prod). Supabase mails a link to /auth/confirm?token_hash=…&type=…;
// we exchange it for a session, then redirect into the app.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Recovery links must land on the password form; everything else onboards.
  const fallback = type === "recovery" ? "/reset-password" : "/onboarding";
  const next = searchParams.get("next") ?? fallback;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const dest = next.startsWith("/") && !next.startsWith("//") ? next : fallback;
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=verify", request.url));
}
