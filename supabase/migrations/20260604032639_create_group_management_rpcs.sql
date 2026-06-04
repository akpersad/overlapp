-- ============================================================================
-- Migration: create_group_management_rpcs
-- DATA-MODEL.md §9-E (soft-delete write path) · spec §9 (admin: dissolve,
-- transfer, manage members)
--
-- Two things the direct-RLS path can't safely do:
--
--   1. dissolve_group(group_id) — soft-delete. A plain `UPDATE … deleted_at`
--      is rejected (42501): every SELECT policy filters `deleted_at is null`,
--      so the row would update itself out of the owner's visibility and
--      PostgreSQL refuses the write (the §9-E finding). Must go through a
--      SECURITY DEFINER RPC. Owner-only.
--
--   2. transfer_group_ownership(group_id, new_owner) — promotes an active
--      member to owner and demotes the old owner to admin, keeping a single
--      owner. Owner-only.
--
-- Plus a role-integrity guard so the open member-management policies (admins
-- UPDATE group_members) can't be abused to mint a second owner or quietly
-- modify the owner's own row. The guard distinguishes the privileged
-- (SECURITY DEFINER / trigger) path from a direct `authenticated` call by
-- current_user, so the owner-auto-membership trigger and these RPCs still work.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Role-integrity guard. Blocks an `authenticated` caller (the normal RLS path)
-- from assigning the 'owner' role or mutating an existing owner row. The
-- owner-membership trigger and the transfer RPC run as the function owner
-- (current_user <> 'authenticated'), so they are unaffected.
-- ----------------------------------------------------------------------------
create or replace function public.guard_member_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    -- No direct promotion to owner.
    if new.role = 'owner' then
      raise exception 'owner role can only be assigned via transfer_group_ownership'
        using errcode = '42501';
    end if;
    -- The existing owner's membership row is immutable on the direct path
    -- (demotion happens only inside transfer_group_ownership).
    if tg_op = 'UPDATE' and old.role = 'owner' then
      raise exception 'the owner''s membership cannot be modified directly'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger group_members_guard_role
  before insert or update on public.group_members
  for each row execute function public.guard_member_role();

revoke execute on function public.guard_member_role() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- dissolve_group — owner-only soft-delete (the §9-E write path).
-- ----------------------------------------------------------------------------
create or replace function public.dissolve_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  update public.groups
  set deleted_at = now()
  where id = p_group_id
    and owner_id = v_uid
    and deleted_at is null;

  if not found then
    raise exception 'only the owner can dissolve this group' using errcode = '42501';
  end if;
end;
$$;

comment on function public.dissolve_group(uuid) is
  'Owner-only soft-delete of a group (§9-E write path). Sets deleted_at; RLS then hides it everywhere.';

-- ----------------------------------------------------------------------------
-- transfer_group_ownership — owner promotes an active member to owner and is
-- demoted to admin. Single-owner invariant preserved.
-- ----------------------------------------------------------------------------
create or replace function public.transfer_group_ownership(
  p_group_id  uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = v_uid and deleted_at is null
  ) then
    raise exception 'only the owner can transfer ownership' using errcode = '42501';
  end if;

  if p_new_owner = v_uid then
    return;  -- no-op
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_new_owner and status = 'active'
  ) then
    raise exception 'the new owner must be an active member' using errcode = 'P0001';
  end if;

  update public.group_members set role = 'admin'
  where group_id = p_group_id and user_id = v_uid;

  update public.group_members set role = 'owner', status = 'active'
  where group_id = p_group_id and user_id = p_new_owner;

  update public.groups set owner_id = p_new_owner where id = p_group_id;
end;
$$;

comment on function public.transfer_group_ownership(uuid, uuid) is
  'Owner-only: promote an active member to owner, demote caller to admin. Keeps a single owner.';

-- ----------------------------------------------------------------------------
-- Grants — both RPCs require a signed-in caller.
-- ----------------------------------------------------------------------------
revoke execute on function public.dissolve_group(uuid)                  from public, anon, authenticated;
revoke execute on function public.transfer_group_ownership(uuid, uuid)  from public, anon, authenticated;
grant  execute on function public.dissolve_group(uuid)                  to authenticated;
grant  execute on function public.transfer_group_ownership(uuid, uuid)  to authenticated;
