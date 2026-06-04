-- ============================================================================
-- Migration: create_push_subscriptions  (Phase 4 — Web Push)
-- spec §7 (notifications) · roadmap P4 ("push notifications for proposals /
-- reminders"). The in-app notifications layer (Phase 3) stays the source of
-- truth; Web Push is an additional delivery channel layered on top of it.
--
-- Each row is one browser/device Push subscription (endpoint + the two keys the
-- Web Push encryption needs). A user may have several (phone, laptop, …). The
-- server reads these via the service role to send pushes; the keys are not
-- secrets that need hiding from the owner (they're per-device, useless without
-- the VAPID private key), so the owner may read/manage their own rows.
-- ============================================================================

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,        -- the push service URL (unique per device)
  p256dh       text not null,               -- client public key (base64url)
  auth         text not null,               -- client auth secret (base64url)
  user_agent   text,                        -- for the "manage devices" UI
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

comment on table public.push_subscriptions is
  'Web Push subscriptions, one per browser/device (P4). Read/managed by the owner; the server sends via the service role. endpoint is globally unique.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Owner self-manages; the service role (push sender) gets full access. Explicit
-- service_role grant because the hosted project has auto-expose OFF.
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

create policy push_subscriptions_select_own
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_update_own
  on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
