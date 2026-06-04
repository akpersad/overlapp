// Public Supabase connection values, shared by the browser, server, and proxy
// clients. These are NEXT_PUBLIC_* so they're safe in the browser bundle — RLS
// is the real authorization boundary (see DATA-MODEL.md §0). They must be
// referenced as static `process.env.NEXT_PUBLIC_*` literals for Next to inline
// them into the client bundle, so we read them here rather than dynamically.

// Exported for unit testing; also used by the constants below.
export function assertEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    )
  }
  return value
}

export const SUPABASE_URL = assertEnv(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
)

export const SUPABASE_ANON_KEY = assertEnv(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
)
