# Overlapp — Data Model

> Status: **proposal for review** · Created 2026-06-03
> This is the gated next step from SPEC.md. Schema is expressed as Postgres/Supabase DDL so it
> can become migrations directly. All open decisions are now **locked** (§9). Phase tags show
> when each table first matters.
>
> **Locked 2026-06-03:** recurrence = iCal `RRULE` + expansion · OAuth tokens = Supabase Vault,
> server-only · deletion = soft-delete (`deleted_at`) · heatmap = on-the-fly RPC for P1 ·
> email mirrored into `profiles` via signup trigger.

## 0. Principles

- **Supabase Auth owns identity.** `auth.users` holds email, password hash, OAuth identity,
  and email-verification state. We never duplicate those. Our `public.profiles` is a 1:1
  extension keyed by `auth.users.id`.
- **All timestamps are `timestamptz`, stored in UTC.** Viewer-local projection happens at read
  time (spec §Resolved details). Granularity is a *group* setting, not stored on each row.
- **Privacy is enforced in the database, not the UI.** Raw event rows (with titles) are
  **owner-only** via RLS. Co-members can read only *de-identified busy intervals* (start/end,
  no title, no source). The aggregate heatmap is built from that exposed layer.
- **RLS on every table, deny-by-default.** Membership is the unit of authorization.
- **Secrets (OAuth tokens) are never client-readable** — see §9-C.

## 1. Enums

```sql
create type member_role        as enum ('owner', 'admin', 'member');
create type member_status      as enum ('active', 'pending');      -- pending = awaiting approval
create type join_control       as enum ('open', 'approval');       -- per-group invite policy
create type calendar_provider  as enum ('google', 'microsoft', 'apple_caldav', 'ics');
create type sync_status        as enum ('ok', 'syncing', 'error', 'revoked');
create type override_state      as enum ('free', 'blocked');       -- null elsewhere = "use default"
create type proposal_status     as enum ('draft', 'open', 'locked', 'cancelled');
create type rsvp                as enum ('yes', 'no', 'maybe');
```

## 2. Identity & profiles  *(P1)*

`auth.users` (Supabase-managed) → mirrored on signup into `public.profiles`.

```sql
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,                       -- mirrored from auth for invite matching (§9-D)
  first_name    text not null,
  last_name     text not null,
  display_name  text,                                -- null → render "First L."
  time_zone     text not null default 'UTC',         -- IANA, auto-detected & editable
  avatar_url    text,                                -- null → initials avatar
  notif_prefs   jsonb not null default '{}'::jsonb,  -- sensible defaults, editable
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                          -- soft-delete; every RLS policy filters it
);
```

A `handle_new_user()` trigger on `auth.users` insert creates the profile row and runs the
pending-invite auto-join (§5).

## 3. Groups & membership  *(P1)*

```sql
create table public.groups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  avatar_url      text,
  owner_id        uuid not null references public.profiles(id),
  slot_minutes    int not null default 30 check (slot_minutes in (15, 30, 60)),
  join_policy     join_control not null default 'open',
  quorum          int,                               -- null = "everyone"; else N members (P3)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                          -- soft-delete; dissolve vs transfer on owner deletion
);

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       member_role   not null default 'member',
  status     member_status not null default 'active',
  joined_at  timestamptz   not null default now(),
  primary key (group_id, user_id)
);
```

- **Size cap (15)** enforced by a `before insert` trigger counting active members (spec §Group size).
- **Multiple admins** supported via `role`. Owner is the single `groups.owner_id`; account
  deletion must transfer or dissolve owned groups (spec §8).

## 4. Invite links  *(P1)*

Shareable token links (Web Share API). Distinct from email invites (§5).

```sql
create table public.group_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  token       text not null unique,                 -- in the share URL
  join_code   text unique,                          -- optional short human code
  created_by  uuid not null references public.profiles(id),
  expires_at  timestamptz,                           -- null = no expiry
  revoked_at  timestamptz,                           -- non-null = dead
  max_uses    int,                                   -- null = unlimited
  use_count   int not null default 0,
  created_at  timestamptz not null default now()
);
```

Invite preview (group + inviter name only) reads via a `security definer` RPC so an
unauthenticated/non-member can see *just* those two fields and nothing else (spec §Access).

## 5. Email-keyed pending invites  *(P1)*

For inviting someone who has no account yet.

```sql
create table public.pending_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  email       text not null,
  role        member_role not null default 'member',
  invited_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  unique (group_id, email)
);
```

`handle_new_user()` matches the new account's email against `pending_invites` and creates the
corresponding `group_members` rows (respecting `join_policy`), then deletes the consumed rows.

## 6. Connected calendars & synced events  *(P2)*

```sql
create table public.calendars (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  provider            calendar_provider not null,
  provider_account    text,                          -- email/account id at the provider
  display_name        text,
  -- token columns are NOT client-readable; see §9-C (Vault or service-role-only)
  sync_cursor         text,                          -- delta/sync token for incremental pulls
  sync_state          sync_status not null default 'ok',
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  unique (user_id, provider, provider_account)
);

create table public.events (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  calendar_id         uuid not null references public.calendars(id) on delete cascade,
  provider_event_id   text not null,
  title               text,                          -- OWNER-ONLY; never exposed to co-members
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  is_all_day          boolean not null default false,
  provider_busy       boolean not null default true, -- provider's free/busy ("busy by default")
  category            text,                          -- provider category, for per-category override
  override            override_state,                -- null = follow provider_busy + category rule
  updated_at          timestamptz not null default now(),
  unique (calendar_id, provider_event_id)
);

-- per-category override (e.g. all "Personal" events → free)
create table public.category_overrides (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  category   text not null,
  state      override_state not null,
  primary key (user_id, category)
);
```

Effective busy for a synced event = `override` if set, else `category_overrides.state` if a
matching category rule exists, else `provider_busy`.

## 7. Manual blocks  *(P1; recurrence may slip — see §9-A)*

User-authored unavailable time, including recurring ("never Sunday mornings").

```sql
create table public.manual_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  label       text,                                  -- optional, owner-only
  starts_at   timestamptz not null,                  -- first occurrence (UTC)
  ends_at     timestamptz not null,
  rrule       text,                                  -- iCal RRULE; null = one-off  (§9-A)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

## 8. The availability layer (the heart)

Per the spec formula: `net busy = synced events (minus overrides) + manual blocks`. Two
exposed layers, both RLS-guarded:

1. **`my_busy_intervals(range)`** — owner-only function/view returning a user's effective busy
   intervals over a window (synced events with overrides applied + manual-block occurrences
   expanded). Used to render *your own* availability and the proposal pre-fill.
2. **`group_busy_intervals(group_id, range)`** — returns `(user_id, starts_at, ends_at)` for
   **every active member**, **with no titles/source** — readable only by co-members. This is
   the privacy boundary in code: members learn *when* someone is busy, never *why*.

The **heatmap** (per-slot free count, "everyone free", quorum) is computed from layer 2 — in
the query/RPC for P1; a materialized cache is a later optimization (§9-B). Recurrence expansion
strategy is the main open question (§9-A).

## 9. Locked decisions (2026-06-03)

- **A — Recurrence.** Store an **iCal `RRULE` string** (`manual_blocks.rrule`) and expand
  occurrences per query window (Postgres function or app layer). Standard; future-proofs
  calendar write-back & recurring hangouts (P4).
- **B — Heatmap computation.** **Compute on-the-fly** in an RPC for P1 (≤15 members, manual
  blocks only — cheap). Documented path to a materialized `availability_cache` once calendar
  sync (P2) makes recomputation expensive.
- **C — OAuth token storage.** Tokens are **never client-readable** — encrypted via **Supabase
  Vault / pgsodium**, accessed only by the server-side sync worker (service role). RLS on
  `calendars` exposes metadata (provider, sync state) to the owner, never the secret columns.
- **D — Email mirroring.** **Mirror `auth.users.email` into `profiles.email`** via the signup
  trigger so `pending_invites` matching is a simple join.
- **E — Deletion.** **Soft-delete** (`deleted_at` on `profiles` and `groups`); every RLS policy
  filters it; purge on a schedule. Keeps proposal/membership history and supports the
  "transfer or dissolve owned groups" flow (spec §8).
  - ⚠️ **Write path (learned via integration tests, 2026-06-03):** because every read policy
    filters `deleted_at is null`, an owner/admin **cannot** soft-delete via a direct
    `UPDATE … SET deleted_at = …` — PostgreSQL requires an UPDATE's resulting row to still
    satisfy the SELECT policy, so the row would update itself out of visibility and the write is
    rejected (42501). **Soft-delete / dissolution must go through a `SECURITY DEFINER` RPC**
    (which sets `deleted_at`, handles owner transfer-vs-dissolve, and bypasses RLS). To be built
    with group management. See `docs/TESTING.md` → Findings.

## 10. Proposals (multi-date scheduling)  *(P3 — included for a coherent whole)*

```sql
create table public.proposals (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  created_by   uuid not null references public.profiles(id),
  title        text not null,
  description  text,
  status       proposal_status not null default 'draft',
  pinned_tz    text,                                  -- when the event's TZ matters (e.g. a flight)
  final_option uuid,                                  -- → proposal_options.id once locked
  created_at   timestamptz not null default now()
);

create table public.proposal_options (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null
);

create table public.proposal_responses (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  option_id   uuid not null references public.proposal_options(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  response    rsvp not null,
  created_at  timestamptz not null default now(),
  primary key (option_id, user_id)
);
```

Responses pre-fill from `my_busy_intervals` (low-effort marking); Overlapp computes the overlap
across responders; proposer picks `final_option`; locked event optionally writes back to each
opted-in member's real calendar.

## 11. RLS posture (summary)

| Table | Read | Write |
|---|---|---|
| `profiles` | self + co-members (profile basics only) | self |
| `groups` | members; name+inviter via definer RPC for invite preview | admins/owner |
| `group_members` | co-members | admins (role/approval), self (leave) |
| `group_invites` | admins; token lookup via definer RPC | admins |
| `pending_invites` | admins | admins; consumed by signup trigger |
| `calendars` | owner (metadata only; tokens never) | owner |
| `events` | **owner only** | owner + sync worker |
| `category_overrides`, `manual_blocks` | owner only | owner |
| `group_busy_intervals` (view/RPC) | co-members — de-identified, no titles | n/a |
| `proposals` / `options` / `responses` | group members | proposer/admins; own response |

## 12. Build order for Phase 1

`profiles` + signup trigger → `groups` + `group_members` (+ size-cap trigger) → `group_invites`
& `pending_invites` (+ auto-join) → `manual_blocks` → `my_busy_intervals` /
`group_busy_intervals` → heatmap RPC. Everything in §6 and §10 is P2/P3.
