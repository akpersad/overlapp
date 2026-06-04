-- ============================================================================
-- Migration: create_manual_blocks
-- DATA-MODEL.md §7 (manual blocks) · §9-A (recurrence = iCal RRULE) · §11 (RLS)
--
-- User-authored unavailable time ("never Sunday mornings"). This is the only
-- P1 input to the availability layer (calendar sync is P2), so it feeds both
-- my_busy_intervals and the group heatmap (built in the next migration).
--
-- Recurrence is stored as an iCal RRULE string (§9-A). Expansion into concrete
-- occurrences happens in the availability RPCs, not here. `label` is owner-only
-- (privacy: co-members see *when* you're busy, never *why*) — enforced by RLS
-- making the whole row owner-only and exposing de-identified intervals via the
-- group_busy_intervals RPC instead.
-- ============================================================================

create table public.manual_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  label       text,                                            -- optional, OWNER-ONLY
  starts_at   timestamptz not null,                            -- first occurrence (UTC)
  ends_at     timestamptz not null,
  rrule       text,                                            -- iCal RRULE; null = one-off (§9-A)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint manual_blocks_time_order check (ends_at > starts_at)
);

comment on table public.manual_blocks is
  'User-authored unavailable time (incl. recurring via rrule). RLS: owner-only; exposed to co-members de-identified through group_busy_intervals().';

create index manual_blocks_user_id_idx on public.manual_blocks (user_id);
-- Range scans for a query window are by user + start time.
create index manual_blocks_user_starts_idx on public.manual_blocks (user_id, starts_at);

create trigger manual_blocks_set_updated_at
  before update on public.manual_blocks
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS — owner-only (deny-by-default). auth.uid() wrapped in a subselect so the
-- planner caches it per-statement. Co-member visibility is NOT a table policy;
-- it goes through the de-identified group_busy_intervals RPC (next migration).
-- ============================================================================
alter table public.manual_blocks enable row level security;

grant select, insert, update, delete on public.manual_blocks to authenticated;

create policy manual_blocks_select_own
  on public.manual_blocks
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy manual_blocks_insert_own
  on public.manual_blocks
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy manual_blocks_update_own
  on public.manual_blocks
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy manual_blocks_delete_own
  on public.manual_blocks
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
