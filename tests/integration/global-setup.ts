import { execFileSync } from "node:child_process";

import type { GlobalSetupContext } from "vitest/node";

// Pulls the live connection details from the running local Supabase stack and
// hands them to the test workers via Vitest's provide/inject channel (setting
// process.env here would NOT reach the worker threads). Fails loudly with a fix
// hint if the stack isn't up, so integration tests never run against a phantom.
export default function setup({ provide }: GlobalSetupContext) {
  let status: Record<string, string>;
  try {
    const out = execFileSync(
      "npx",
      ["supabase", "status", "-o", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    status = JSON.parse(out);
  } catch {
    throw new Error(
      "Local Supabase stack is not reachable. Start it first:\n" +
        "  npm run db:start    # requires Docker Desktop running\n" +
        "  npm run db:reset    # (re)apply migrations to a clean DB\n" +
        "then re-run the integration tests.",
    );
  }

  if (!status.API_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error(
      "`supabase status` did not report API_URL / ANON_KEY / SERVICE_ROLE_KEY.",
    );
  }

  provide("supabaseUrl", status.API_URL);
  provide("anonKey", status.ANON_KEY);
  provide("serviceKey", status.SERVICE_ROLE_KEY);
}

declare module "vitest" {
  interface ProvidedContext {
    supabaseUrl: string;
    anonKey: string;
    serviceKey: string;
  }
}
