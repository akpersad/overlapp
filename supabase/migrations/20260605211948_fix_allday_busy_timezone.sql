-- ============================================================================
-- Migration: fix_allday_busy_timezone  (Pre-launch correctness fix)
-- PRE-LAUNCH.md "Known correctness issues" — all-day busy events block the
-- wrong local day.
--
-- All-day calendar events are *floating calendar dates* (Google `start.date`,
-- Microsoft `isAllDay`). Sync stores them as UTC-midnight instants
-- (`2026-06-06T00:00:00Z` → `2026-06-07T00:00:00Z`), which is fine as storage
-- but ambiguous without a zone. Testing busy overlap on those raw UTC bounds
-- shifts the busy window by the owner's UTC offset: for an EDT (UTC-4) owner an
-- all-day "Vacation" on Jun 6 blocked `Jun 5 8pm → Jun 6 8pm` local instead of
-- the owner's calendar day. (Free all-day events were unaffected — they never
-- block. The *display* was already fixed via LocalTime/AllDayRange; this is the
-- busy-interval data fix.)
--
-- Fix: expand each all-day event into the **owner's** local calendar day using
-- their stored `profiles.time_zone` (IANA, exists since the profiles table) and
-- only then test overlap. Timed events are untouched. The fix lives entirely in
-- effective_event_busy_intervals — my_busy_intervals, group_busy_intervals and
-- group_heatmap all route through it, so every consumer is corrected at once
-- with no signature or app changes. Affects both Google and Microsoft (same
-- UTC-midnight mapping).
--
-- Security posture is unchanged (SECURITY INVOKER): self-only via events RLS
-- when called directly; reads each active member when called from the SECURITY
-- DEFINER group RPCs. The new profiles join follows the same posture — own row
-- under RLS directly, any row as the definer — and time_zone never reaches the
-- output (intervals stay de-identified).
-- ============================================================================

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
  select s.starts_at, s.ends_at
  from (
    select
      -- All-day → the owner's local calendar day. Take the floating date (the
      -- date part of the UTC-midnight instant), reinterpret midnight of that
      -- date in the owner's zone. Timed events pass through unchanged.
      case when e.is_all_day
        then ((e.starts_at at time zone 'UTC')::date)::timestamp
               at time zone coalesce(pr.time_zone, 'UTC')
        else e.starts_at
      end as starts_at,
      case when e.is_all_day
        then ((e.ends_at at time zone 'UTC')::date)::timestamp
               at time zone coalesce(pr.time_zone, 'UTC')
        else e.ends_at
      end as ends_at,
      case
        when e.override = 'blocked' then true
        when e.override = 'free'    then false
        when co.state   = 'blocked' then true
        when co.state   = 'free'    then false
        else e.provider_busy
      end as is_busy
    from public.events e
    left join public.profiles pr on pr.id = e.user_id
    left join public.category_overrides co
      on co.user_id = e.user_id and co.category = e.category
    where e.user_id = p_user_id
      -- Loose prefilter on the raw stored bounds (keeps index usage), widened by
      -- a day to cover the largest possible tz shift (< 24h) so an all-day event
      -- near the window edge that shifts into range survives. The exact overlap
      -- test on the localized bounds is applied below.
      and e.starts_at < p_to   + interval '1 day'
      and e.ends_at   > p_from - interval '1 day'
  ) s
  where s.is_busy
    and s.starts_at < p_to
    and s.ends_at   > p_from;
$$;

comment on function public.effective_event_busy_intervals(uuid, timestamptz, timestamptz) is
  'Effective busy intervals from a user''s synced events over [from, to) with per-event/per-category overrides applied. All-day events are expanded into the owner''s local calendar day via profiles.time_zone. SECURITY INVOKER: self-only via RLS when called directly; reads any member when called from the SECURITY DEFINER group RPCs.';

revoke execute on function public.effective_event_busy_intervals(uuid, timestamptz, timestamptz) from public, anon;
grant  execute on function public.effective_event_busy_intervals(uuid, timestamptz, timestamptz) to authenticated;
