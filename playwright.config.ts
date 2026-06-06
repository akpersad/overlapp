import { defineConfig, devices } from "@playwright/test";

import { localSupabase } from "./tests/e2e/_creds";

// e2e + visual layer (docs/TESTING.md). Boots `next dev` pointed at the LOCAL
// Supabase stack (env below overrides .env.local, which points at hosted) and
// drives the real flows as a user. Mobile viewport — Overlapp is mobile-first.
const PORT = 3100;
const { url, anonKey, serviceKey } = localSupabase();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    viewport: { width: 390, height: 844 },
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      // The admin client (avatar upload, account deletion) reads this; .env.local
      // points it at the HOSTED project, which would fail against the LOCAL URL
      // above. Pin it to the local stack's service-role key so those flows work.
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      // Force calendar sync OFF for the suite regardless of what .env.local holds,
      // so the Calendars page deterministically renders the "not configured" notice.
      // (.env.local sets these for the live OAuth round-trip — a manual check, see
      // docs/TESTING.md → Manual pre-launch checks.)
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      MICROSOFT_CLIENT_ID: "",
      MICROSOFT_CLIENT_SECRET: "",
    },
  },
});
