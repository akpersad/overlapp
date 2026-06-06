import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Parity guard for the bug fixed in migration fix_proposal_helper_grants — the
// function-grant twin of service-role-grants.test.ts.
//
// A `create function` grants EXECUTE to PUBLIC by default. LOCALLY, Supabase's
// default privileges ALSO grant EXECUTE to `authenticated` directly, so a
// `revoke execute ... from public` leaves authenticated able to call the
// function. The HOSTED project has no such default, so authenticated only ever
// held EXECUTE via PUBLIC — and the revoke strips it, leaving the function
// postgres-only. A helper used INSIDE an RLS policy then fails with "permission
// denied for function ..." in production while every local + integration test
// passes. A live grant-check can't catch it (local always shows the implicit
// grant), so we assert statically that each such helper is EXPLICITLY granted
// EXECUTE to authenticated in a migration.
//
// MAINTENANCE: when a new SECURITY DEFINER helper is referenced from an RLS
// policy (USING / WITH CHECK) AND revoked from public, add it here AND add the
// explicit `grant execute ... to authenticated` in its migration.
const AUTHENTICATED_EXEC_FUNCTIONS = [
  "proposal_group_id", // proposal_options / proposal_responses RLS policies
  "can_manage_proposal", // proposal_options write policies + nudge action
];

const migrationsDir = fileURLToPath(
  new URL("../../supabase/migrations", import.meta.url),
);

function allMigrationSql(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(`${migrationsDir}/${f}`, "utf8"))
    .join("\n");
}

describe("function EXECUTE grants — local/prod parity guard", () => {
  const sql = allMigrationSql();

  it.each(AUTHENTICATED_EXEC_FUNCTIONS)(
    "migrations grant execute on public.%s to authenticated",
    (fn) => {
      // A single `grant execute on function [public.]<fn>(...) ... to ...
      // authenticated` statement (no `;` between the function and the grantee
      // keeps it to one statement).
      expect(sql).toMatch(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+(public\\.)?${fn}\\s*\\([^;]*\\bto\\s+[^;]*\\bauthenticated\\b`,
          "i",
        ),
      );
    },
  );
});
