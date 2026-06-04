import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Two test projects (see docs/TESTING.md):
//   • unit        — pure logic, no I/O. Fast, run anywhere.
//   • integration — drives the real @supabase/supabase-js → PostgREST → RLS
//                    path against the LOCAL Supabase stack (Docker). Acts as
//                    real signed-in users, so it exercises triggers + policies
//                    the way the app does. Requires `npm run db:start` first.
const srcDir = fileURLToPath(new URL("./src", import.meta.url));
// `server-only` throws if imported outside an RSC build; stub it so we can unit-
// test server-only modules' pure logic (e.g. the Google OAuth/event mapping).
const serverOnlyStub = fileURLToPath(
  new URL("./tests/_stubs/server-only.ts", import.meta.url),
);
const sharedAlias = { "@": srcDir, "server-only": serverOnlyStub };

export default defineConfig({
  resolve: {
    alias: sharedAlias,
  },
  test: {
    // Files never run in parallel — the integration project shares one local
    // database (per-project singleFork pins it to a single process too).
    fileParallelism: false,
    projects: [
      {
        resolve: { alias: sharedAlias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          // config.ts reads NEXT_PUBLIC_* at import time; give it values so the
          // module evaluates and we can unit-test the exported helper/constants.
          env: {
            NEXT_PUBLIC_SUPABASE_URL: "http://unit.test.local",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "unit-test-anon-key",
            NEXT_PUBLIC_SITE_URL: "https://overlapp.test",
            GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
            GOOGLE_CLIENT_SECRET: "test-client-secret",
          },
        },
      },
      {
        resolve: { alias: sharedAlias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          // Real network + auth round-trips; give them room.
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // These tests share ONE local database and each file's beforeEach
          // resets all test data — so they must run strictly serially. A single
          // fork (one process, files one-at-a-time) guarantees no two files
          // touch the DB at once (fileParallelism:false at root reinforces it).
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
