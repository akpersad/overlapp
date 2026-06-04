-- ============================================================================
-- Migration: grant_service_role_server_tables
--
-- The hosted project has auto_expose_new_tables = OFF, so tables created by
-- migrations are NOT auto-granted to the Data API roles — including service_role.
-- The server-side code reaches PostgREST as service_role and needs explicit
-- table grants (RLS is bypassed by service_role; this is purely the table-level
-- GRANT that PostgREST checks):
--   • calendar sync worker → calendars, events  (calendar_secrets already granted)
--   • account deletion      → groups
-- Local stacks already have these implicitly; the grants are idempotent there.
-- ============================================================================

grant select, insert, update, delete on public.calendars          to service_role;
grant select, insert, update, delete on public.events             to service_role;
grant select, insert, update, delete on public.category_overrides to service_role;
grant select, insert, update, delete on public.groups             to service_role;
