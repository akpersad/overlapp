import { defineConfig, devices } from "@playwright/test";

import { localSupabase } from "./tests/e2e/_creds";

// e2e + visual layer (docs/TESTING.md). Boots `next dev` pointed at the LOCAL
// Supabase stack (env below overrides .env.local, which points at hosted) and
// drives the real flows as a user. Mobile viewport — Overlapp is mobile-first.
const PORT = 3100;
const { url, anonKey } = localSupabase();

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
    },
  },
});
