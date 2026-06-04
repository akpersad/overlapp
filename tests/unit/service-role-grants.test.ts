import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Parity guard for the bug fixed in migration grant_service_role_server_tables.
//
// The hosted Supabase project has `auto_expose_new_tables = OFF`, so a table
// created by a migration gets NO Data-API grants — including `service_role` —
// unless a migration grants them explicitly. The LOCAL stack grants service_role
// implicitly, so a missing grant passes every local + integration test and then
// 403s in production. A live grant-check can't catch this (local always shows the
// implicit grant), so we assert statically that each table the server writes to
// AS THE SERVICE ROLE has an explicit `grant ... to service_role` in a migration.
//
// MAINTENANCE: when the admin / service-role client (createAdminClient) starts
// writing a NEW table, add it to this list AND add the grant in its migration.
const SERVER_WRITTEN_TABLES = [
  "calendars", // saveGoogleConnection + syncCalendar (sync worker)
  "calendar_secrets", // token store (sync worker)
  "events", // upsert/prune (sync worker)
  "groups", // dissolve owned groups (account deletion)
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

describe("service_role grants — local/prod parity guard", () => {
  const sql = allMigrationSql();

  it.each(SERVER_WRITTEN_TABLES)(
    "migrations create public.%s",
    (table) => {
      expect(sql).toMatch(
        new RegExp(`create\\s+table\\s+(public\\.)?${table}\\b`, "i"),
      );
    },
  );

  it.each(SERVER_WRITTEN_TABLES)(
    "migrations grant service_role on public.%s",
    (table) => {
      // A single `grant <privs> on [public.]<table> ... to ... service_role`
      // statement (no `;` between the table and the grantee keeps it to one stmt).
      expect(sql).toMatch(
        new RegExp(
          `grant\\s+[^;]*\\bon\\s+(public\\.)?${table}\\b[^;]*\\bto\\s+[^;]*\\bservice_role\\b`,
          "i",
        ),
      );
    },
  );
});
