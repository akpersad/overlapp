-- ============================================================================
-- Migration: create_recurring_hangouts  (Phase 4 — recurring hangouts)
-- roadmap P4 ("recurring hangouts for regular groups") · §9-A (RRULE) reuse.
--
-- A recurring hangout is a group-level repeating template ("Board games, every
-- Friday 7–9pm"). It is NOT availability and NOT a locked event — it's a
-- standing intention the group can act on. We store it exactly like a manual
-- block (an anchor occurrence `starts_at`/`ends_at` in UTC + an iCal `rrule`),
-- so the existing, tested `expand_block_occurrences` expander gives us concrete
-- upcoming occurrences for free. From an occurrence a member can seed a
-- multi-date proposal (the Phase 3 flow), keeping one scheduling path.
--
-- RLS: read = group members; write = group admins (it's group configuration,
-- like granularity/quorum). Status transitions are plain updates (active flag).
-- ============================================================================

create table public.recurring_hangouts (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  created_by  uuid not null references public.profiles (id),
  title       text not null,
  description text,
  -- Anchor occurrence (first instance), stored UTC like manual_blocks; the
  -- expander preserves its time-of-day across occurrences.
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  rrule       text not null,                  -- recurrence is the point; required
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint recurring_hangouts_time_order check (ends_at > starts_at)
);

comment on table public.recurring_hangouts is
  'Group-level repeating hangout templates (P4). Stored like a manual block (anchor + rrule) so expand_block_occurrences yields upcoming occurrences. Read: members. Write: admins.';

create index recurring_hangouts_group_idx on public.recurring_hangouts (group_id);

create trigger recurring_hangouts_set_updated_at
  before update on public.recurring_hangouts
  for each row execute function public.set_updated_at();

alter table public.recurring_hangouts enable row level security;
grant select, insert, update, delete on public.recurring_hangouts to authenticated;
grant select, insert, update, delete on public.recurring_hangouts to service_role;

create policy recurring_hangouts_select_member
  on public.recurring_hangouts for select to authenticated
  using (public.is_group_member(group_id));

create policy recurring_hangouts_insert_admin
  on public.recurring_hangouts for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_admin(group_id));

create policy recurring_hangouts_update_admin
  on public.recurring_hangouts for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy recurring_hangouts_delete_admin
  on public.recurring_hangouts for delete to authenticated
  using (public.is_group_admin(group_id));

-- ----------------------------------------------------------------------------
-- upcoming_hangouts — concrete next occurrences for a group's active hangouts,
-- from now() out to a horizon. Member-gated SECURITY DEFINER (mirrors the other
-- group_* RPCs). Reuses the RRULE expander; caps results per the caller's
-- horizon. Ordered chronologically so the UI can show "the next few".
-- ----------------------------------------------------------------------------
create or replace function public.upcoming_hangouts(
  p_group_id uuid,
  p_to       timestamptz
)
returns table (
  hangout_id  uuid,
  title       text,
  description text,
  occ_start   timestamptz,
  occ_end     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_from timestamptz := now();
begin
  if not public.is_group_member(p_group_id) then
    return;
  end if;
  -- Clamp the horizon to a year so a pathological request can't expand forever.
  if p_to is null or p_to > v_from + interval '366 days' then
    p_to := v_from + interval '366 days';
  end if;

  return query
    select h.id, h.title, h.description, o.occ_start, o.occ_end
    from public.recurring_hangouts h
    cross join lateral public.expand_block_occurrences(
      h.starts_at, h.ends_at, h.rrule, v_from, p_to
    ) o
    where h.group_id = p_group_id and h.active
    order by o.occ_start;
end;
$$;

comment on function public.upcoming_hangouts(uuid, timestamptz) is
  'Concrete upcoming occurrences of a group''s active recurring hangouts, now()→horizon (capped 366d). Member-gated. Reuses expand_block_occurrences.';

revoke execute on function public.upcoming_hangouts(uuid, timestamptz) from public, anon;
grant execute on function public.upcoming_hangouts(uuid, timestamptz) to authenticated;
