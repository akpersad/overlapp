-- ============================================================================
-- Migration: heatmap_quorum  (Phase 3 — "good enough" quorum)
-- DATA-MODEL.md §8 · spec §Quorum ("good enough" relaxation arrives in Phase 3).
--
-- P1/P2 group_heatmap only flagged everyone_free. Phase 3 surfaces the group's
-- quorum (groups.quorum; null = everyone) so the heatmap can highlight slots
-- where *enough* members are free even if not all are (e.g. 4 of 5).
--
-- Adding return columns changes the function's result type, which CREATE OR
-- REPLACE cannot do — so we DROP and recreate. The body is otherwise identical
-- to extend_availability_with_events (manual blocks + synced events), plus the
-- quorum verdict.
-- ============================================================================

drop function if exists public.group_heatmap(uuid, timestamptz, timestamptz, int);

create function public.group_heatmap(
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
  everyone_free boolean,
  quorum        int,
  meets_quorum  boolean
)
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_slot   int;
  v_total  int;
  v_quorum int;
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

  select coalesce(p_slot_minutes, g.slot_minutes), coalesce(g.quorum, 0)
    into v_slot, v_quorum
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

  -- A quorum of 0 (groups.quorum is null) means "everyone" → effective quorum
  -- is the active member count.
  if v_quorum <= 0 or v_quorum > v_total then
    v_quorum := v_total;
  end if;

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
    (count(distinct busy.uid) = 0)                          as everyone_free,
    v_quorum                                                as quorum,
    ((v_total - count(distinct busy.uid)) >= v_quorum)      as meets_quorum
  from slots sl
  left join busy
    on busy.s < sl.slot_end and busy.e > sl.slot_start
  group by sl.slot_start, sl.slot_end
  order by sl.slot_start;
end;
$$;

comment on function public.group_heatmap(uuid, timestamptz, timestamptz, int) is
  'On-the-fly per-slot availability aggregate: manual blocks + synced events (overrides applied). Member-gated. everyone_free = nobody busy; meets_quorum = free_count >= effective quorum (groups.quorum, or everyone when null).';

revoke execute on function public.group_heatmap(uuid, timestamptz, timestamptz, int) from public, anon, authenticated;
grant  execute on function public.group_heatmap(uuid, timestamptz, timestamptz, int) to authenticated;
