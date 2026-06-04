-- ============================================================================
-- Migration: create_calendar_tables  (Phase 2 — calendar sync)
-- DATA-MODEL.md §6 (calendars / events / category_overrides) · §9-C (token
-- storage) · §11 (RLS posture).
--
-- Phase 2 adds *synced* availability on top of P1's manual blocks. The privacy
-- model is unchanged and is the whole point of the product: co-members learn
-- *when* you are busy, never *why*. So:
--
--   • calendars         — connection metadata, OWNER-readable. No secrets here.
--   • calendar_secrets  — OAuth tokens. SERVICE-ROLE ONLY (never client-readable;
--                         §9-C). RLS on, zero policies, no anon/authenticated
--                         grants → only the server-side sync worker can touch it.
--   • events            — synced events incl. the private `title`. OWNER-ONLY RLS,
--                         exactly like manual_blocks. Inserted/updated by the sync
--                         worker (service role); the owner may set `override`.
--   • category_overrides— per-category free/blocked rules, OWNER-ONLY.
--
-- Effective busy for a synced event (DATA-MODEL §6):
--     override         if set,
--     else category_overrides.state for its category if a rule exists,
--     else provider_busy.
-- That resolution lives in the availability RPCs (next migration), not here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums (DATA-MODEL §1). calendar_provider lists all four planned providers
-- though P2 only wires Google; the rest land in later phases (MS → Apple/ICS).
-- ----------------------------------------------------------------------------
create type public.calendar_provider as enum ('google', 'microsoft', 'apple_caldav', 'ics');
create type public.sync_status       as enum ('ok', 'syncing', 'error', 'revoked');
create type public.override_state    as enum ('free', 'blocked');

-- ----------------------------------------------------------------------------
-- calendars — one row per connected calendar account. Metadata only; tokens
-- live in calendar_secrets. Owner-readable; created/updated by the server.
-- ----------------------------------------------------------------------------
create table public.calendars (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  provider         public.calendar_provider not null,
  provider_account text,                                   -- email/account id at the provider
  display_name     text,
  sync_cursor      text,                                   -- delta/sync token for incremental pulls
  sync_state       public.sync_status not null default 'ok',
  last_synced_at   timestamptz,
  last_error       text,                                   -- last sync failure detail (owner-visible)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, provider, provider_account)
);

comment on table public.calendars is
  'Connected calendar accounts (metadata only; tokens live in calendar_secrets). RLS: owner reads + disconnects; the sync worker (service role) creates/updates.';

create index calendars_user_id_idx on public.calendars (user_id);

create trigger calendars_set_updated_at
  before update on public.calendars
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- calendar_secrets — OAuth tokens. THE secret store. Never client-readable
-- (§9-C). RLS enabled with NO policies and NO grants to anon/authenticated, so
-- the Data API roles are denied entirely; only service_role (BYPASSRLS, used by
-- the server-side sync worker) can read/write. Cascades when the calendar goes.
-- ----------------------------------------------------------------------------
create table public.calendar_secrets (
  calendar_id      uuid primary key references public.calendars (id) on delete cascade,
  access_token     text not null,
  refresh_token    text,
  token_expires_at timestamptz,
  scope            text,
  updated_at       timestamptz not null default now()
);

comment on table public.calendar_secrets is
  'OAuth access/refresh tokens. SERVICE-ROLE ONLY — RLS on, no policies, no Data-API grants (DATA-MODEL §9-C). Never exposed to the client.';

alter table public.calendar_secrets enable row level security;
-- No grant to anon/authenticated on purpose. Explicit grant to service_role so
-- the worker can manage tokens regardless of the project's default privileges.
grant select, insert, update, delete on public.calendar_secrets to service_role;

create trigger calendar_secrets_set_updated_at
  before update on public.calendar_secrets
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- events — synced calendar events. OWNER-ONLY (the `title` is private, like a
-- manual block's label). The sync worker (service role) inserts/updates rows;
-- the owner may set/clear `override`. Co-member exposure is de-identified via
-- the availability RPCs only.
-- ----------------------------------------------------------------------------
create table public.events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  calendar_id       uuid not null references public.calendars (id) on delete cascade,
  provider_event_id text not null,
  title             text,                                  -- OWNER-ONLY; never exposed to co-members
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  is_all_day        boolean not null default false,
  provider_busy     boolean not null default true,         -- provider free/busy ("busy by default")
  category          text,                                  -- provider category, for per-category override
  override          public.override_state,                 -- null = follow provider_busy + category rule
  updated_at        timestamptz not null default now(),
  unique (calendar_id, provider_event_id),
  constraint events_time_order check (ends_at > starts_at)
);

comment on table public.events is
  'Synced calendar events (busy-by-default + per-event override). RLS: owner-only — title/category never leave via a table read; co-members see de-identified intervals through the availability RPCs.';

create index events_user_id_idx on public.events (user_id);
-- Window scans for the availability RPCs are by user + start time.
create index events_user_starts_idx on public.events (user_id, starts_at);
create index events_calendar_id_idx on public.events (calendar_id);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- category_overrides — "all my Personal events don't block me." Owner-only.
-- ----------------------------------------------------------------------------
create table public.category_overrides (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  category   text not null,
  state      public.override_state not null,
  created_at timestamptz not null default now(),
  primary key (user_id, category)
);

comment on table public.category_overrides is
  'Per-category free/blocked rules applied to synced events lacking a per-event override. Owner-only.';

-- ============================================================================
-- RLS — owner-only for calendars / events / category_overrides. auth.uid()
-- wrapped in a subselect so the planner caches it per-statement (matches the
-- manual_blocks pattern). calendars: the owner may read + DELETE (disconnect),
-- but INSERT/UPDATE happen server-side via the service role, so no
-- insert/update policy is granted to authenticated.
-- ============================================================================
alter table public.calendars enable row level security;
grant select, delete on public.calendars to authenticated;

create policy calendars_select_own
  on public.calendars for select to authenticated
  using (user_id = (select auth.uid()));

create policy calendars_delete_own
  on public.calendars for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.events enable row level security;
grant select, update on public.events to authenticated;

create policy events_select_own
  on public.events for select to authenticated
  using (user_id = (select auth.uid()));

-- The owner may flip an event's override; the worker manages everything else.
create policy events_update_own
  on public.events for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.category_overrides enable row level security;
grant select, insert, update, delete on public.category_overrides to authenticated;

create policy category_overrides_select_own
  on public.category_overrides for select to authenticated
  using (user_id = (select auth.uid()));

create policy category_overrides_insert_own
  on public.category_overrides for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy category_overrides_update_own
  on public.category_overrides for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy category_overrides_delete_own
  on public.category_overrides for delete to authenticated
  using (user_id = (select auth.uid()));
