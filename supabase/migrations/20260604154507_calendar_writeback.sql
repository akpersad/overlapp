-- ============================================================================
-- Migration: calendar_writeback  (Phase 3 — locked-event write-back)
-- spec §6 / §Calendar write-back ("opt-in per user; pushes a locked event to
-- their real calendar") · DATA-MODEL §10 (optional write-back on lock).
--
-- When a proposal is locked, members who opted in get the chosen slot pushed to
-- their connected calendar. Two additions:
--
--   • calendars.writeback_enabled — per-calendar opt-in (default OFF). The owner
--     toggles it; everything else on calendars is still server-written, so we
--     grant UPDATE on JUST this column (column-level grant) + an owner policy.
--
--   • event_writebacks — idempotency ledger: which (proposal, user) already got
--     a calendar event, and the provider's event id (so a re-run won't double-
--     write, and a future "remove" could delete it). Service-role written;
--     owner-readable.
--
-- NB: write-back needs a WRITABLE Google scope (calendar.events). Connections
-- made with the old read-only scope must reconnect (docs/GOOGLE-SETUP.md). The
-- worker degrades gracefully (marks the calendar's last_error) if the scope is
-- insufficient.
-- ============================================================================

alter table public.calendars
  add column writeback_enabled boolean not null default false;

comment on column public.calendars.writeback_enabled is
  'Owner opt-in: push locked proposal events to this calendar (spec §write-back). Requires a writable provider scope.';

-- The owner may flip ONLY writeback_enabled directly; all other columns remain
-- server-written (no broad update policy existed before). Column-level grant
-- limits which columns an UPDATE may touch; the policy gates the row.
grant update (writeback_enabled) on public.calendars to authenticated;

create policy calendars_update_writeback_own
  on public.calendars for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- event_writebacks — idempotency ledger for pushed events. One row per
-- (proposal, user). Service-role written; owner may read their own rows.
-- ----------------------------------------------------------------------------
create table public.event_writebacks (
  proposal_id       uuid not null references public.proposals (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  calendar_id       uuid not null references public.calendars (id) on delete cascade,
  provider_event_id text not null,
  created_at        timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

comment on table public.event_writebacks is
  'Ledger of locked-proposal events pushed to members'' real calendars (idempotency + future removal). Service-role written; owner-readable.';

create index event_writebacks_user_idx on public.event_writebacks (user_id);

alter table public.event_writebacks enable row level security;
grant select on public.event_writebacks to authenticated;
grant select, insert, update, delete on public.event_writebacks to service_role;

create policy event_writebacks_select_own
  on public.event_writebacks for select to authenticated
  using (user_id = (select auth.uid()));
