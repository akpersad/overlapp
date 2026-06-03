import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Server-side Supabase client for Server Components, Server Actions, and Route
// Handlers. In Next.js 16 `cookies()` is async, so this factory is async too —
// always `await createClient()`.
//
// The `setAll` try/catch is intentional: cookies can't be written from a Server
// Component render. When that happens we swallow the error and rely on the
// proxy (src/proxy.ts) to refresh the session cookie on the next request.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — safe to ignore (see note above).
        }
      },
    },
  });
}
