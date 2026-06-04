-- ============================================================================
-- Migration: fix_group_select_for_creator
--
-- BUG: creating a group with `insert(...).select()` (PostgREST
-- INSERT ... RETURNING, which supabase-js uses by default) failed with
-- 42501 "new row violates row-level security policy for table groups".
--
-- Cause: the groups SELECT policy was `is_group_member(id)`. The creator's
-- membership row is written by the add_owner_membership AFTER-INSERT trigger
-- *within the same statement*. is_group_member is STABLE, so during the
-- RETURNING phase it reads the statement-start snapshot and does not yet see
-- that membership row → the row is judged unreadable → the insert is rejected.
-- (A separate SELECT after the insert works, which is why it slipped past the
-- earlier server-side smoke test.)
--
-- Fix: also admit a group to its owner directly. The owner is always an active
-- member anyway, so this only changes behaviour during the creation RETURNING
-- window; it is otherwise redundant and safe. owner_id is checked first so the
-- cheap comparison short-circuits before the function call.
-- ============================================================================

alter policy groups_select_members on public.groups
  using (
    deleted_at is null
    and (owner_id = (select auth.uid()) or public.is_group_member(id))
  );
