-- ============================================================================
-- Migration: create_availability_rpcs
-- DATA-MODEL.md §8 (availability layer) · §9-A (RRULE) · §9-B (on-the-fly heatmap)
--
-- The availability layer — the heart of the product. Three exposed functions:
--
--   1. expand_block_occurrences(start, end, rrule, from, to)
--        Pure helper: expands one (possibly recurring) manual block into the
--        concrete occurrences that overlap a [from, to) window. Supports the
--        RRULE subset the P1 block editor emits: FREQ=DAILY|WEEKLY|MONTHLY,
--        INTERVAL, COUNT, UNTIL, and BYDAY (weekly). Bounded iteration.
--
--   2. my_busy_intervals(from, to)        — SECURITY INVOKER; RLS restricts to
--        the caller's own blocks. Renders "your availability" + proposal pre-fill.
--
--   3. group_busy_intervals(group_id, from, to) — SECURITY DEFINER, member-gated;
--        returns (user_id, start, end) for every ACTIVE member with NO label /
--        source. This is the privacy boundary in code (§0): co-members learn
--        *when* someone is busy, never *why*.
--
--   4. group_heatmap(group_id, from, to, slot_minutes) — SECURITY DEFINER,
--        member-gated; aggregates layer 3 into per-slot free/busy counts with an
--        "everyone free" flag. Computed on-the-fly (§9-B; cheap for ≤15 members,
--        manual blocks only). Quorum stays null/everyone for P1 (§Quorum, P3).
--
-- All four pin `timezone = 'UTC'` so weekday math and slot series are
-- deterministic regardless of the caller's session tz (blocks are stored UTC).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RRULE expander. STABLE (UNTIL parsing via to_timestamp is tz-stable; we
-- pin UTC). No table access, so SECURITY INVOKER (default) is irrelevant.
-- Occurrences are generated chronologically from DTSTART so COUNT is honoured
-- exactly, then filtered to those overlapping [p_from, p_to).
-- ----------------------------------------------------------------------------
create or replace function public.expand_block_occurrences(
  p_start timestamptz,
  p_end   timestamptz,
  p_rrule text,
  p_from  timestamptz,
  p_to    timestamptz
)
returns table (occ_start timestamptz, occ_end timestamptz)
language plpgsql
stable
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_duration   interval := p_end - p_start;
  v_parts      text[];
  v_part       text;
  v_kv         text[];
  v_freq       text;
  v_interval   int := 1;
  v_count      int;
  v_until      timestamptz;
  v_byday      text[];
  v_emitted    int := 0;          -- occurrences generated so far (for COUNT)
  v_iter       int := 0;
  v_max_iter   int := 20000;      -- safety cap on runaway rules
  v_occ        timestamptz;
  v_monday     timestamptz;
  v_n          int := 0;
  v_dow_tokens text[] := array['MO','TU','WE','TH','FR','SA','SU'];
begin
  -- One-off block (no recurrence): emit if it overlaps the window.
  if p_rrule is null or btrim(p_rrule) = '' then
    if p_start < p_to and p_end > p_from then
      occ_start := p_start; occ_end := p_end; return next;
    end if;
    return;
  end if;

  -- Parse the RRULE (tolerate an optional "RRULE:" prefix; upper-case keys/vals).
  v_parts := string_to_array(upper(replace(btrim(p_rrule), 'RRULE:', '')), ';');
  foreach v_part in array v_parts loop
    v_kv := string_to_array(v_part, '=');
    if array_length(v_kv, 1) = 2 then
      case v_kv[1]
        when 'FREQ'     then v_freq := v_kv[2];
        when 'INTERVAL' then v_interval := nullif(v_kv[2], '')::int;
        when 'COUNT'    then v_count := nullif(v_kv[2], '')::int;
        when 'BYDAY'    then v_byday := string_to_array(v_kv[2], ',');
        when 'UNTIL'    then
          v_until := case
            when v_kv[2] like '%T%'
              then to_timestamp(replace(v_kv[2], 'Z', ''), 'YYYYMMDD"T"HH24MISS')
            else to_timestamp(v_kv[2], 'YYYYMMDD')
          end;
        else null;
      end case;
    end if;
  end loop;

  if v_interval is null or v_interval < 1 then v_interval := 1; end if;

  -- Unknown/blank FREQ → treat as one-off so a malformed rule never vanishes.
  if v_freq is null or v_freq not in ('DAILY', 'WEEKLY', 'MONTHLY') then
    if p_start < p_to and p_end > p_from then
      occ_start := p_start; occ_end := p_end; return next;
    end if;
    return;
  end if;

  -- WEEKLY + BYDAY: step week by week, emit each selected weekday in order.
  if v_freq = 'WEEKLY' and v_byday is not null then
    -- Monday 00-offset of the start week, preserving DTSTART's time-of-day.
    v_monday := p_start - make_interval(days => extract(isodow from p_start)::int - 1);
    <<weeks>>
    loop
      exit when v_iter > v_max_iter;
      for wd in 0..6 loop
        v_iter := v_iter + 1;
        continue when not (v_dow_tokens[wd + 1] = any (v_byday));
        v_occ := v_monday + make_interval(weeks => v_n * v_interval, days => wd);
        continue when v_occ < p_start;                       -- before DTSTART
        exit weeks when v_until is not null and v_occ > v_until;
        v_emitted := v_emitted + 1;
        exit weeks when v_count is not null and v_emitted > v_count;
        exit weeks when v_occ >= p_to;                       -- window passed
        if v_occ + v_duration > p_from then
          occ_start := v_occ; occ_end := v_occ + v_duration; return next;
        end if;
      end loop;
      v_n := v_n + 1;
    end loop;
    return;
  end if;

  -- DAILY / WEEKLY (no BYDAY) / MONTHLY: one occurrence per step.
  loop
    exit when v_iter > v_max_iter;
    v_iter := v_iter + 1;
    v_occ := case v_freq
      when 'DAILY'   then p_start + make_interval(days   => v_n * v_interval)
      when 'WEEKLY'  then p_start + make_interval(weeks  => v_n * v_interval)
      when 'MONTHLY' then p_start + make_interval(months => v_n * v_interval)
    end;
    exit when v_until is not null and v_occ > v_until;
    v_emitted := v_emitted + 1;
    exit when v_count is not null and v_emitted > v_count;
    exit when v_occ >= p_to;
    if v_occ + v_duration > p_from then
      occ_start := v_occ; occ_end := v_occ + v_duration; return next;
    end if;
    v_n := v_n + 1;
  end loop;
  return;
end;
$$;

comment on function public.expand_block_occurrences(timestamptz, timestamptz, text, timestamptz, timestamptz) is
  'Expands a (possibly recurring) manual block into occurrences overlapping [from, to). RRULE subset: FREQ DAILY/WEEKLY/MONTHLY, INTERVAL, COUNT, UNTIL, BYDAY (weekly).';

-- ----------------------------------------------------------------------------
-- 2. my_busy_intervals — the caller's own effective busy intervals. SECURITY
-- INVOKER: manual_blocks RLS already scopes rows to the owner.
-- ----------------------------------------------------------------------------
create or replace function public.my_busy_intervals(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  select occ.occ_start, occ.occ_end
  from public.manual_blocks b
  cross join lateral
    public.expand_block_occurrences(b.starts_at, b.ends_at, b.rrule, p_from, p_to) occ
  order by occ.occ_start;
$$;

comment on function public.my_busy_intervals(timestamptz, timestamptz) is
  'The signed-in user''s effective busy intervals over [from, to). RLS-scoped to self.';

-- ----------------------------------------------------------------------------
-- 3. group_busy_intervals — de-identified busy intervals for every active
-- member (the privacy boundary). SECURITY DEFINER to read past manual_blocks
-- owner-only RLS, but member-gated and returns NO label/source.
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
  -- Non-members (and anon) get nothing — never an error that leaks existence.
  if not public.is_group_member(p_group_id) then
    return;
  end if;

  return query
    select gm.user_id, occ.occ_start, occ.occ_end
    from public.group_members gm
    join public.manual_blocks b on b.user_id = gm.user_id
    cross join lateral
      public.expand_block_occurrences(b.starts_at, b.ends_at, b.rrule, p_from, p_to) occ
    where gm.group_id = p_group_id
      and gm.status = 'active'
    order by gm.user_id, occ.occ_start;
end;
$$;

comment on function public.group_busy_intervals(uuid, timestamptz, timestamptz) is
  'De-identified (user_id, start, end) busy intervals for active members. Member-gated; no titles/source — the privacy boundary (DATA-MODEL §0,§8).';

-- ----------------------------------------------------------------------------
-- 4. group_heatmap — per-slot aggregate. SECURITY DEFINER, member-gated. Slot
-- size defaults to the group's slot_minutes. everyone_free = no member busy in
-- that slot (quorum relaxation is P3). Window is capped to bound the slot series.
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
    select gm.user_id, occ.occ_start as s, occ.occ_end as e
    from public.group_members gm
    join public.manual_blocks b on b.user_id = gm.user_id
    cross join lateral
      public.expand_block_occurrences(b.starts_at, b.ends_at, b.rrule, p_from, p_to) occ
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
    count(distinct busy.user_id)::int                       as busy_count,
    (v_total - count(distinct busy.user_id))::int           as free_count,
    v_total                                                 as total_members,
    (count(distinct busy.user_id) = 0)                      as everyone_free
  from slots sl
  left join busy
    on busy.s < sl.slot_end and busy.e > sl.slot_start
  group by sl.slot_start, sl.slot_end
  order by sl.slot_start;
end;
$$;

comment on function public.group_heatmap(uuid, timestamptz, timestamptz, int) is
  'On-the-fly per-slot availability aggregate for a group. Member-gated; everyone_free = no active member busy in the slot (quorum is P3).';

-- ----------------------------------------------------------------------------
-- Grants. expand_block_occurrences is a pure helper — keep it callable by
-- authenticated (it touches no tables) but off anon. my_busy_intervals +
-- group_* are the client RPCs. Revoke-then-grant so each grant is explicit.
-- ----------------------------------------------------------------------------
revoke execute on function public.expand_block_occurrences(timestamptz, timestamptz, text, timestamptz, timestamptz) from public, anon;
revoke execute on function public.my_busy_intervals(timestamptz, timestamptz)                                       from public, anon;
revoke execute on function public.group_busy_intervals(uuid, timestamptz, timestamptz)                              from public, anon, authenticated;
revoke execute on function public.group_heatmap(uuid, timestamptz, timestamptz, int)                                from public, anon, authenticated;

grant execute on function public.my_busy_intervals(timestamptz, timestamptz)            to authenticated;
grant execute on function public.group_busy_intervals(uuid, timestamptz, timestamptz)   to authenticated;
grant execute on function public.group_heatmap(uuid, timestamptz, timestamptz, int)     to authenticated;
