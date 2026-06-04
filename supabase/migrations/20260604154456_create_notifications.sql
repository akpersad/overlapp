-- ============================================================================
-- Migration: create_notifications  (Phase 3 — notifications + nudges)
-- spec §7 (notifications) · roadmap P3 ("auto-remind non-responders").
--
-- In-app notifications only. Push delivery is Phase 4 (Web Push); email infra is
-- deliberately avoided (free-tier-first — invites use Web Share, not email). So
-- a notification here is a row the recipient reads in the app: "New proposal",
-- "Event locked", and the proposer's "Reminder to respond" nudge.
--
-- Rows are created server-side (Server Actions, via the service role) because a
-- normal user must be able to notify OTHER members — which a self-only insert
-- policy would forbid. So: no INSERT grant to authenticated; reads/updates
-- (mark-read) / deletes are self-only.
-- ============================================================================

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,                            -- 'proposal_created' | 'proposal_locked' | 'proposal_nudge' | 'proposal_cancelled'
  group_id    uuid references public.groups (id) on delete cascade,
  proposal_id uuid references public.proposals (id) on delete cascade,
  title       text not null,
  body        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.notifications is
  'In-app notifications (spec §7). Created server-side via the service role (a member may notify others); read/mark-read/delete are self-only. Push delivery is P4.';

create index notifications_user_idx on public.notifications (user_id, created_at desc);
-- Partial index for the unread badge count.
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- No INSERT grant to authenticated on purpose (server-side only). Explicit
-- service_role grant so the worker/actions can write regardless of project
-- default privileges (hosted has auto-expose OFF).
grant select, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;

create policy notifications_select_own
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
