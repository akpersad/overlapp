-- ============================================================================
-- Migration: pending_member_visibility
--
-- Gap found while building the approval-join UI: a member with status='pending'
-- (awaiting admin approval after redeeming an approval-policy invite) was
-- invisible to themselves. is_group_member() requires status='active', so the
-- group_members co-member read policy and the groups read policy both excluded
-- pending users — they couldn't see "you're awaiting approval", and the
-- post-redeem redirect 404'd.
--
-- Fixes, without widening anyone else's visibility:
--   1. group_members: a user can always read their OWN membership row (any
--      status). Co-members still see the active roster via is_group_member.
--   2. groups: a pending OR active member can read the group's basic row, via a
--      SECURITY DEFINER any-status helper (breaks RLS recursion like the others).
-- Availability/heatmap RPCs still gate on is_group_member (active), so a pending
-- user sees the group exists but no member availability until approved.
-- ============================================================================

-- Any-status membership check (active OR pending). SECURITY DEFINER so the
-- policy that calls it doesn't recurse into group_members' own RLS.
create or replace function public.has_group_membership(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id  = (select auth.uid())
  );
$$;

-- Revoking from public strips the inherited grant; re-grant to authenticated
-- explicitly (the lesson from fix_membership_helper_grants).
revoke execute on function public.has_group_membership(uuid) from public, anon;
grant  execute on function public.has_group_membership(uuid) to authenticated;

-- 1. Self can read their own membership row regardless of status.
create policy group_members_select_self
  on public.group_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- 2. Pending (and active) members can read the group's basic row.
create policy groups_select_pending
  on public.groups
  for select
  to authenticated
  using (deleted_at is null and public.has_group_membership(id));
