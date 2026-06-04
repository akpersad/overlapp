-- ============================================================================
-- Migration: realtime_availability_broadcast  (Phase 5 — realtime heatmap)
--
-- Goal: when anything that affects a group's heatmap changes, push a tiny
-- "refresh" signal to that group's members so their open heatmap updates live —
-- WITHOUT breaking the free/busy privacy model.
--
-- Why Broadcast (not postgres_changes): a member cannot read another member's
-- manual_blocks / events rows (owner-only RLS), so a postgres_changes
-- subscription would deliver nothing for other people's edits — exactly the
-- changes we want to reflect. Instead, AFTER triggers call `realtime.send` with
-- a payload that contains ONLY the group_id (never any event data). Clients
-- subscribe to a private per-group topic and re-run the de-identified
-- `group_heatmap` RPC on receipt. So the broadcast is a doorbell, not the data.
--
-- Authorization: the per-group topic is PRIVATE. Realtime checks a SELECT policy
-- on `realtime.messages` (with `realtime.topic()` set to the channel topic), so
-- only active members of <group_id> may receive `group-availability:<group_id>`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- broadcast_availability_change — for user-owned availability tables
-- (manual_blocks, events, category_overrides). A user's availability feeds
-- every group they're an active member of, so we ring each of those groups.
-- Row-level (single edits are cheap; bulk calendar syncs are coalesced on the
-- client by a short debounce). Payload carries no event data — just the group.
-- ----------------------------------------------------------------------------
create or replace function public.broadcast_availability_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := coalesce(new.user_id, old.user_id);
  v_group uuid;
begin
  if v_user is null then
    return null;
  end if;

  for v_group in
    select gm.group_id
    from public.group_members gm
    where gm.user_id = v_user
      and gm.status  = 'active'
  loop
    perform realtime.send(
      jsonb_build_object('group_id', v_group),
      'availability_changed',
      'group-availability:' || v_group::text,
      true  -- private topic
    );
  end loop;

  return null;
end;
$$;

comment on function public.broadcast_availability_change() is
  'AFTER trigger: rings the realtime "group-availability:<id>" topic for every active group of the changed row''s owner. Payload is the group id only (no event data) — Phase 5 live heatmap.';

revoke execute on function public.broadcast_availability_change() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Group-keyed tables. Two functions because PL/pgSQL resolves record fields at
-- runtime: group_members is keyed by `group_id`, groups by `id`, and a single
-- function referencing both would error on whichever column is absent.
-- ----------------------------------------------------------------------------
create or replace function public.broadcast_group_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := coalesce(new.group_id, old.group_id);
begin
  if v_group is null then
    return null;
  end if;

  perform realtime.send(
    jsonb_build_object('group_id', v_group),
    'availability_changed',
    'group-availability:' || v_group::text,
    true
  );

  return null;
end;
$$;

comment on function public.broadcast_group_membership_change() is
  'AFTER trigger on group_members: rings the realtime "group-availability:<id>" topic when membership changes (affects total members) — Phase 5 live heatmap.';

revoke execute on function public.broadcast_group_membership_change() from public, anon, authenticated;

create or replace function public.broadcast_group_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := coalesce(new.id, old.id);
begin
  if v_group is null then
    return null;
  end if;

  perform realtime.send(
    jsonb_build_object('group_id', v_group),
    'availability_changed',
    'group-availability:' || v_group::text,
    true
  );

  return null;
end;
$$;

comment on function public.broadcast_group_settings_change() is
  'AFTER trigger on groups: rings the realtime "group-availability:<id>" topic when group settings (e.g. slot size / quorum) change the heatmap — Phase 5 live heatmap.';

revoke execute on function public.broadcast_group_settings_change() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Triggers. AFTER (we only react to committed changes); FOR EACH ROW.
-- ----------------------------------------------------------------------------
create trigger manual_blocks_broadcast
  after insert or update or delete on public.manual_blocks
  for each row execute function public.broadcast_availability_change();

create trigger events_broadcast
  after insert or update or delete on public.events
  for each row execute function public.broadcast_availability_change();

create trigger category_overrides_broadcast
  after insert or update or delete on public.category_overrides
  for each row execute function public.broadcast_availability_change();

create trigger group_members_broadcast
  after insert or update or delete on public.group_members
  for each row execute function public.broadcast_group_membership_change();

create trigger groups_broadcast
  after update on public.groups
  for each row execute function public.broadcast_group_settings_change();

-- ----------------------------------------------------------------------------
-- Authorization helper + RLS policy on realtime.messages.
-- can_read_group_broadcast parses the "group-availability:<uuid>" topic safely
-- (returns false for any other / malformed topic) and defers to the existing
-- is_group_member helper, so only active members receive a group's broadcasts.
-- ----------------------------------------------------------------------------
create or replace function public.can_read_group_broadcast(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gid uuid;
begin
  if p_topic is null or p_topic not like 'group-availability:%' then
    return false;
  end if;
  begin
    v_gid := substring(p_topic from 'group-availability:(.*)')::uuid;
  exception when others then
    return false;
  end;
  return public.is_group_member(v_gid);
end;
$$;

comment on function public.can_read_group_broadcast(text) is
  'Realtime authorization: true iff the caller is an active member of the group encoded in a "group-availability:<uuid>" broadcast topic. Used by the realtime.messages SELECT policy.';

revoke execute on function public.can_read_group_broadcast(text) from public, anon;
grant  execute on function public.can_read_group_broadcast(text) to authenticated;

-- Receiving a private broadcast is a SELECT on realtime.messages. RLS is already
-- enabled on that table by Supabase; we add the receive policy for our topics.
create policy "group members receive availability broadcasts"
  on realtime.messages
  for select
  to authenticated
  using ( public.can_read_group_broadcast(realtime.topic()) );
