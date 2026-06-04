import { execFileSync } from "node:child_process";

// Pull local Supabase connection details (same source the integration global
// setup uses). e2e drives the running app against the LOCAL stack, never hosted.
export function localSupabase(): {
  url: string;
  anonKey: string;
  serviceKey: string;
} {
  let status: Record<string, string>;
  try {
    status = JSON.parse(
      execFileSync("npx", ["supabase", "status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    throw new Error(
      "Local Supabase stack is not reachable. Run `npm run db:start` (+ `npm run db:reset`) first.",
    );
  }
  if (!status.API_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error("`supabase status` missing API_URL / ANON_KEY / SERVICE_ROLE_KEY.");
  }
  return {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceKey: status.SERVICE_ROLE_KEY,
  };
}
