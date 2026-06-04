import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { SUPABASE_URL } from "./config";

// Service-role Supabase client. BYPASSES RLS — server-only, never importable
// from client code (the "server-only" guard throws if it leaks into a bundle).
// Used by:
//   • the calendar sync worker, to read/write calendar_secrets + events
//     (calendar_secrets has no Data-API grants, so only this role can touch it);
//   • account deletion, to dissolve owned groups and delete the auth user.
//
// The key is SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix → never bundled).
// Treat it like a root password. Validated lazily so app code that never touches
// the admin client doesn't require the key to be present.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Required for calendar sync and account deletion. See .env.example.",
    );
  }
  return createSupabaseClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
