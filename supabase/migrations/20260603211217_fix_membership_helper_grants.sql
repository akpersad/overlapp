-- ============================================================================
-- Migration: fix_membership_helper_grants
--
-- create_groups_and_members revoked EXECUTE on the membership helpers from
-- `public` to keep them off the anon-reachable API. But PostgREST's
-- `authenticated` role only had EXECUTE *via* the default PUBLIC grant — so
-- revoking from `public` also stripped it from `authenticated`, which breaks
-- the RLS policies that call these functions (every group/group_members/
-- profiles read would error with "permission denied for function").
--
-- Fix: grant EXECUTE explicitly to `authenticated`. The anon revoke stands.
-- ============================================================================

grant execute on function public.is_group_member(uuid)   to authenticated;
grant execute on function public.is_group_admin(uuid)    to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;
