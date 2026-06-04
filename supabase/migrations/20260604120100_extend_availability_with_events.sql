-- ============================================================================
-- Migration: extend_availability_with_events  (Phase 2 — calendar sync)
-- DATA-MODEL.md §6 (effective busy resolution) · §8 (availability layer).
--
-- P1 built the availability layer from manual blocks only. P2 folds in synced
-- calendar events, applying the override rules. The spec formula becomes real:
--
--     net busy = manual blocks  +  synced events (with overrides applied)
--
-- Effective busy for one synced event:
--     override            if set            ('blocked' → busy, 'free' → not),
--     else category rule   if one exists,
--     else provider_busy.
--
-- We add one helper — effective_event_busy_intervals(user, from, to) — and fold
-- it into all three exposed functions via UNION ALL with the existing manual-
-- block expansion. The functions are otherwise unchanged (same signatures, same
-- member-gating, same de-identification), so the heatmap/group RPC callers keep
-- working with zero app changes.
--
-- SECURITY MODEL of the helper (important): it is SECURITY INVOKER.
--   • Called directly by `authenticated` via my_busy_intervals → events RLS
--     (owner-only) scopes it to the caller's own rows; passing someone else's
--     user_id returns nothing (RLS filters regardless of the argument).
--   • Called from inside the SECURITY DEFINER group_* functions → it runs as the
--     definer (postgres, BYPASSRLS), so it can read each active member's events.
--   This is exactly how group_busy_intervals already reads owner-only
--   manual_blocks today; we keep the same posture.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: a user's effective *busy* synced events overlapping [from, to), as
-- bare intervals (no title/category/source — the de-identification happens here
-- too). STABLE, SECURITY INVOKER. UTC-pinned like the rest of the layer.
-- ----------------------------------------------------------------------------
create or replace function public.effective_event_busy_intervals(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  select e.starts_at, e.ends_at
  from public.events e
  left join public.category_overrides co
    on co.user_id = e.user_id and co.category = e.category
  where e.user_id = p_user_id
    and e.starts_at < p_to
    and e.ends_at   > p_from
    and case
      when e.override = 'blocked' then true
      when e.override = 'free'    then false
      when co.state   = 'blocked' then true
      when co.state   = 'free'    then false
      else e.provider_busy
    end;
$$;

comment on function public.effective_event_busy_intervals(uuid, timestamptz, timestamptz) is
  'Effective busy intervals from a user''s synced events over [from, to) with per-event/per-category overrides applied. SECURITY INVOKER: self-only via RLS when called directly; reads any member when called from the SECURITY DEFINER group RPCs.';

-- ----------------------------------------------------------------------------
-- my_busy_intervals — now manual blocks UNION effective synced events.
-- ----------------------------------------------------------------------------
create or replace function public.my_busy_intervals(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  select s.starts_at, s.ends_at
  from (
    select occ.occ_start as starts_at, occ.occ_end as ends_at
    from public.manual_blocks b
    cross join lateral
      public.expand_block_occurrences(b.starts_at, b.ends_at, b.rrule, p_from, p_to) occ
    union all
    select ev.starts_at, ev.ends_at
    from public.effective_event_busy_intervals((select auth.uid()), p_from, p_to) ev
  ) s
  order by s.starts_at;
$$;

comment on function public.my_busy_intervals(timestamptz, timestamptz) is
  'The signed-in user''s effective busy intervals over [from, to): manual blocks + synced events (overrides applied). RLS-scoped to self.';

-- ----------------------------------------------------------------------------
-- group_busy_intervals — de-identified, member-gated; manual blocks + events
-- for every active member.
-- ----------------------------------------------------------------------------
create or replace function public.group_busy_intervals(
  p_group_id uuid,
  p_from     timestamptz,
  p_to       timestamptz
)
returns table (user_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
begin
  if not public.is_group_member(p_group_id) then
    return;
  end if;

  return query
    select u.uid, u.s, u.e
    from (
      select gm.user_id as uid, occ.occ_start as s, occ.occ_end as e
      from public.group_members gm
      join public.manual_blocks b on b.user_id = gm.user_id
      cross join lateral
        public.expand_block_occurrences(b.starts_at, b.ends_at, b.rrule, p_from, p_to) occ
      where gm.group_id = p_group_id
        and gm.status = 'active'
      union all
      select gm.user_id as uid, ev.starts_at as s, ev.ends_at as e
      from public.group_members gm
      cross join lateral
        public.effective_event_busy_intervals(gm.user_id, p_from, p_to) ev
      where gm.group_id = p_group_id
        and gm.status = 'active'
    ) u
    order by u.uid, u.s;
end;
$$;

comment on function public.group_busy_intervals(uuid, timestamptz, timestamptz) is
  'De-identified (user_id, start, end) busy intervals for active members: manual blocks + synced events (overrides applied). Member-gated; no titles/source — the privacy boundary (DATA-MODEL §0,§8).';

-- ----------------------------------------------------------------------------
-- group_heatmap — same aggregate, but the `busy` CTE now spans both sources.
-- ----------------------------------------------------------------------------
create or replace function public.group_heatmap(
  p_group_id     uuid,
  p_from         timestamptz,
  p_to           timestamptz,
  p_slot_minutes int default null
)
returns table (
  slot_start    timestamptz,
  slot_end      timestamptz,
  busy_count    int,
  free_count    int,
  total_members int,
  everyone_free boolean
)
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_slot  int;
  v_total int;
begin
  if not public.is_group_member(p_group_id) then
    return;
  end if;

  if p_to <= p_from then
    raise exception 'p_to must be after p_from' using errcode = '22023';
  end if;
  if p_to - p_from > interval '45 days' then
    raise exception 'heatmap window capped at 45 days' using errcode = '22023';
  end if;

  select coalesce(p_slot_minutes, g.slot_minutes) into v_slot
  from public.groups g
  where g.id = p_group_id and g.deleted_at is null;
  if v_slot is null then            -- group missing or dissolved
    return;
  end if;
  if v_slot not in (15, 30, 60) then
    raise exception 'invalid slot size %', v_slot using errcode = '22023';
  end if;

  select count(*)::int into v_total
  from public.group_members gm
  where gm.group_id = p_group_id and gm.status = 'active';

  return query
  with busy as (
    select gm.user_id as uid, occ.occ_start as s, occ.occ_end as e
    from public.group_members gm
    join public.manual_blocks b on b.user_id = gm.user_id
    cross join lateral
      public.expand_block_occurrences(b.starts_at, b.ends_at, b.rrule, p_from, p_to) occ
    where gm.group_id = p_group_id
      and gm.status = 'active'
    union all
    select gm.user_id as uid, ev.starts_at as s, ev.ends_at as e
    from public.group_members gm
    cross join lateral
      public.effective_event_busy_intervals(gm.user_id, p_from, p_to) ev
    where gm.group_id = p_group_id
      and gm.status = 'active'
  ),
  slots as (
    select gs as slot_start, gs + make_interval(mins => v_slot) as slot_end
    from generate_series(p_from, p_to - make_interval(mins => v_slot),
                         make_interval(mins => v_slot)) gs
  )
  select
    sl.slot_start,
    sl.slot_end,
    count(distinct busy.uid)::int                           as busy_count,
    (v_total - count(distinct busy.uid))::int               as free_count,
    v_total                                                 as total_members,
    (count(distinct busy.uid) = 0)                          as everyone_free
  from slots sl
  left join busy
    on busy.s < sl.slot_end and busy.e > sl.slot_start
  group by sl.slot_start, sl.slot_end
  order by sl.slot_start;
end;
$$;

comment on function public.group_heatmap(uuid, timestamptz, timestamptz, int) is
  'On-the-fly per-slot availability aggregate for a group: manual blocks + synced events (overrides applied). Member-gated; everyone_free = no active member busy in the slot (quorum is P3).';

-- ----------------------------------------------------------------------------
-- Grants. The helper is callable by authenticated (my_busy_intervals invokes
-- it); off anon/public. Revoke-then-grant so each is explicit.
-- ----------------------------------------------------------------------------
revoke execute on function public.effective_event_busy_intervals(uuid, timestamptz, timestamptz) from public, anon;
grant  execute on function public.effective_event_busy_intervals(uuid, timestamptz, timestamptz) to authenticated;
