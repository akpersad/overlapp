-- ============================================================================
-- Migration: harden_trigger_functions
-- Resolves security advisor warnings from create_profiles:
--   • 0011 function_search_path_mutable — pin set_updated_at's search_path.
--   • 0028/0029 *_security_definer_function_executable — our trigger functions
--     are exposed as PostgREST RPCs (/rest/v1/rpc/...). They are only meant to
--     fire from triggers (which run as the table owner regardless of grants),
--     so revoke EXECUTE from the API roles. Does NOT affect trigger firing.
-- ============================================================================

alter function public.set_updated_at() set search_path = '';

revoke execute on function public.set_updated_at()  from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
