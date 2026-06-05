@AGENTS.md

# Overlapp

Group-scheduling app that kills the "I'll check my calendar" loop. **North star: a persistent
shared group calendar** — availability lives continuously, so "when can we meet?" is answered
before anyone asks (vs. When2Meet/Doodle one-off polls).

**The full product spec lives in [`docs/SPEC.md`](docs/SPEC.md) — read it first.** It is the
source of truth for the problem, decisions, user journeys, and roadmap.

## Stack
- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, `src/` dir, `@/*` alias
- Supabase (Postgres + Auth + Realtime + RLS)
- Mobile-first PWA (service worker + manifest; Web Push)
- ⚠️ This Next.js has breaking changes vs. common knowledge — see `AGENTS.md`; read
  `node_modules/next/dist/docs/` before writing app code.

## Locked decisions (see SPEC.md for rationale)
- Mobile-first PWA · required (verified) accounts · Supabase backend
- Availability = manual blocks + calendar sync; synced events busy-by-default with per-event/
  per-category **free/blocked overrides** (an event ≠ unavailability — the differentiator)
- Privacy: members see only free/busy, never event details
- Calendar order: **Google → Microsoft → Apple** (Apple = CalDAV, hardest, last; ICS stopgap)
- Email: **Resend** free tier for auth mail; invites via **Web Share API** (no email infra)
- Invites carry a group token → "invited-but-no-account" preview → signup → auto-join;
  `pending_invites` keyed by email. Join control configurable per group (open link + approval toggle)
- Roles: multiple admins · group size cap 15 · slot granularity 30 min (group-settable) ·
  quorum default = everyone
- Proposals are **multi-date**: proposer seeds candidates → members mark availability → app
  computes overlaps → proposer picks the final slot → optional calendar write-back
- Only the landing page is public; everything else gated. Profile page for editing user info.
  Avatar defaults to first+last initials. Onboarding prompts push notifications if PWA installed

## Roadmap
P1 Foundation (auth, groups, invite, manual blocks, group heatmap — build end-to-end first) →
P2 calendar sync + overrides → P3 multi-date proposals, nudges, quorum, write-back →
P4 PWA polish (installable, push, offline, recurring) →
P5 launch readiness & UX polish (legal pages, realtime heatmap, transfer-on-delete) →
P6 Microsoft Calendar **— DEFERRED to the post-launch backlog** (see [`docs/POST-LAUNCH.md`](docs/POST-LAUNCH.md);
a full implementation exists on branch `feature/phase-6-microsoft-calendar` but can't ship until an
Azure app can be registered) → P7 visual design pass (gated on product input, last).
Phases 5–7 detail lives in [`docs/SPEC.md`](docs/SPEC.md) Roadmap.
Pre-launch checklist (legal pages, OAuth verification, deploy): [`docs/PRE-LAUNCH.md`](docs/PRE-LAUNCH.md).
Non-MVP / post-launch backlog (free-tier-first): [`docs/POST-LAUNCH.md`](docs/POST-LAUNCH.md).

## Status / next step
**Resuming a session? Read [`docs/HANDOFF.md`](docs/HANDOFF.md) first** — full current-state handoff.

Spec complete; all product decisions settled. **Data model finalized** — see
[`docs/DATA-MODEL.md`](docs/DATA-MODEL.md). Design principles banked in
[`docs/DESIGN-PRINCIPLES.md`](docs/DESIGN-PRINCIPLES.md) (visual design deferred until after
P1's core loop). **Infra done:** Supabase **production** project provisioned (ref
`qildwjcnzyejgjvnyohi`; no separate dev project — always test against the local stack first) with
Data API on, auto-expose off, automatic RLS on; `.env.local` populated with Supabase URL + anon
key; Resend auth email wired
via custom SMTP + branded templates ([`docs/EMAIL-SETUP.md`](docs/EMAIL-SETUP.md)).

**Phase 1 is COMPLETE and tested (2026-06-04).** Full core loop end-to-end: auth
(signup/login/verify/logout), onboarding, profile, dashboard, group create/edit/manage, the
invite flow (Web Share token links + email pending invites + public preview + redeem), the
manual-block availability editor (weekly RRULE), and the **group heatmap** in viewer-local time.
The app lives under `src/app/` (route group `(app)` = authenticated shell; public:
`login`/`signup`/`verify-email`/`auth/confirm`/`invite/[token]`); Server Actions in
`src/lib/actions/`, DAL in `src/lib/auth.ts`, pure helpers in `src/lib/{format,rrule,ui}.ts`.

DB layer (all applied locally **and** to the hosted project via MCP, advisor-clean except the
intentional `security_definer_function_executable` WARNs): `profiles`, `groups`+`group_members`,
`group_invites`+`pending_invites`, **`manual_blocks`**, the **availability RPCs**
(`expand_block_occurrences` RRULE expander · `my_busy_intervals` · de-identified
`group_busy_intervals` · on-the-fly `group_heatmap`), **group management RPCs** (`dissolve_group`
= the §9-E soft-delete write path · `transfer_group_ownership` · a role-integrity guard), and
**`pending_member_visibility`**.

**Phase 2 (calendar sync) is COMPLETE and tested (2026-06-04)**, plus the remaining P1 follow-ups
(avatar upload + account deletion). New: Google Calendar OAuth (calendar-access flow, not login),
busy-by-default import with a server-side sync worker, per-event + per-category free/blocked
overrides, and a `CRON_SECRET`-protected background re-sync route. The availability RPCs now fold
synced events (overrides applied) into manual blocks. DB: `calendars`, `calendar_secrets`
(service-role-only token store), `events`, `category_overrides` + the `effective_event_busy_intervals`
helper. App: `/calendars` page, `src/lib/google/{oauth,calendar,sync}.ts`, `src/lib/supabase/admin.ts`,
`/api/calendars/google/callback`, `/api/cron/sync-calendars`. **Setup:** [`docs/GOOGLE-SETUP.md`](docs/GOOGLE-SETUP.md)
(needs `GOOGLE_CLIENT_ID/SECRET`, `CRON_SECRET`; absent → Calendars page shows a "not configured" notice).

**Phase 3 (multi-date proposals) is COMPLETE and tested (2026-06-04).** Members seed candidate
slots → the group marks availability per option (pre-filled from general availability via
`suggest_proposal_rsvps`) → `proposal_results` computes the overlap + a quorum verdict → the
proposer/admin locks the final slot → optional **write-back** pushes it to each opted-in member's
Google calendar. Plus **quorum** in the heatmap ("good enough" slots, outlined not recoloured —
colourblind-safe) and in-app **notifications + nudges** (no push — that's P4). DB: `proposals` +
`proposal_options` + `proposal_responses` (+ `create_proposal`/`proposal_results`/`lock_proposal`/
`cancel_proposal`/`suggest_proposal_rsvps` RPCs + `proposal_group_id`/`can_manage_proposal`
helpers), `notifications`, `event_writebacks` (write-back idempotency ledger), `calendars.writeback_enabled`,
and `group_heatmap` extended with `quorum`/`meets_quorum`. App: `/groups/[id]/proposals/new` +
`/groups/[id]/proposals/[proposalId]`, `/notifications` (inbox + nav badge), `src/lib/actions/{proposals,notifications}.ts`,
`src/lib/notifications.ts`, `writeBackProposal` + `insertCalendarEvent` in `src/lib/google/`.
⚠️ Write-back needs the writable `calendar.events` scope (in `GOOGLE_SCOPES`; **declared in the
Google Console → Data Access on 2026-06-04**). Pre-P3 connections hold read-only tokens and must
disconnect + reconnect to grant write access (`docs/GOOGLE-SETUP.md`). **The Google write path
(token refresh + `events.insert`) is VERIFIED against production (2026-06-04)** — a real event was
created in the reconnected account; only the in-app lock→UI round-trip remains as a manual check.

**Testing** (see [`docs/TESTING.md`](docs/TESTING.md)): **41 unit + 79 integration (120)** green, plus a
**Playwright e2e/visual** layer (`npm run test:e2e`) driving the whole loop as a user against the
local stack (screenshots reviewed then deleted). `tsc`, `eslint`, `next build` all green. Scripts:
`test`, `test:unit`, `test:integration`, `test:e2e`, `db:start`/`db:reset`/`db:stop`.
(NB: the e2e calendars step asserts the "not configured" notice, so run e2e with
`GOOGLE_CLIENT_ID`/`SECRET` unset — they're set in `.env.local` for the live round-trip.)

**Migrations applied to BOTH local and the hosted PRODUCTION project via the Supabase MCP**
(5 new, ledger versions `20260604141324`→`145228`: calendar tables, availability-RPC extension,
avatars bucket, an avatars-bucket hardening that drops the broad public-read/list policy, and
explicit `service_role` grants on server-written tables — needed because the hosted project has
auto-expose OFF, a local/prod parity gap now guarded by `tests/unit/service-role-grants.test.ts`).
`get_advisors(security)` is clean except the intentional `security_definer_function_executable`
WARNs and the **intentional** `calendar_secrets` RLS-enabled-no-policy INFO (that table is
service-role-only by design, §9-C). Local file names match the remote ledger versions. **The live
Google OAuth round-trip is VERIFIED end-to-end against production** (2026-06-04): real connect →
consent → token exchange → first sync into `events` → `/calendars?connected=1`. (Google setup
gotchas — Test users + Data Access scopes — are documented in `GOOGLE-SETUP.md`.)

**Phase 3 migrations applied to BOTH local and the hosted PRODUCTION project via MCP** (4 new,
ledger versions `20260604154425`→`154507`: `create_proposals`, `heatmap_quorum`,
`create_notifications`, `calendar_writeback`; local filenames match the remote ledger).
`get_advisors(security)` clean except the same intentional WARNs (the new RPCs add the expected
`security_definer_function_executable` WARNs — same accepted pattern as the existing group RPCs).

**Phase 4 (PWA polish) is COMPLETE and tested (2026-06-04).** All four deliverables shipped:
**installable PWA** (`src/app/manifest.ts` → `/manifest.webmanifest`, generated "overlap"-mark icons
in `public/icons/` via `scripts/generate-icons.mjs`, root-layout PWA metadata); **service worker**
(`public/sw.js`, registered prod-only by `src/components/ServiceWorker.tsx` — app-shell precache,
nav network-first→cache→`/offline`, push + notificationclick); **Web Push** (`web-push` + VAPID,
`push_subscriptions` table, `src/lib/push.ts` wired into `notifyUsers` so every in-app notification
also pushes; opt-in via `PushToggle` on profile + onboarding `InstallPrompt`); **offline group
calendar** (heatmap caches each week in `localStorage`, renders last-saved with an offline banner);
**recurring hangouts** (`recurring_hangouts` table + `upcoming_hangouts` RPC reusing
`expand_block_occurrences`; group page lists next occurrences with a "Propose this" link that
pre-seeds the P3 proposal form). Setup: [`docs/PWA-SETUP.md`](docs/PWA-SETUP.md) (VAPID keys; absent
→ push silently disabled, app unaffected). **Phase 4 migrations applied to BOTH local and the hosted
PRODUCTION project via MCP** (2 new, ledger versions `20260604183848` create_push_subscriptions,
`20260604183918` create_recurring_hangouts; local filenames match). `get_advisors(security)` clean
except the same intentional WARNs (the new `upcoming_hangouts` adds the expected member-gated
`security_definer_function_executable` WARN) + the pre-existing `auth_leaked_password_protection`
auth-config WARN.

**Phase 5 (launch readiness & UX polish) is COMPLETE and tested (2026-06-04).** Three deliverables:
**public legal pages** — `/privacy` + `/terms` (route group `src/app/(legal)/`, `ui.tsx` shared bits;
added to the proxy `PUBLIC_PATHS`; linked from the landing footer) covering collection, the
free/busy-only model, Google Limited Use, deletion, and a contact email (`CONTACT_EMAIL` placeholder
— confirm a real mailbox pre-launch); **realtime heatmap** — AFTER triggers `realtime.send` a
group-id-only "doorbell" on a PRIVATE per-group topic (`group-availability:<id>`) whenever
availability/membership/group-settings change, authorized by a `realtime.messages` SELECT policy
(`can_read_group_broadcast` → `is_group_member`, so co-members never receive event data); the heatmap
client subscribes (`supabase.realtime.setAuth()` + `private: true`) and silently re-fetches the week
(400 ms debounce coalesces bulk syncs); **transfer-on-delete** — account deletion now offers, per
owned group, transferring ownership to another active member (via the existing
`transfer_group_ownership` RPC) instead of always dissolving (`deleteAccount` reads `transfer:<id>`
form fields; profile page gathers eligible owners). **Migration applied to BOTH local and hosted
PRODUCTION via MCP** (1 new, ledger version `20260604211816` realtime_availability_broadcast; local
filename matches). `get_advisors(security)` clean except the same intentional WARNs (the new
`can_read_group_broadcast` adds the expected `security_definer_function_executable` WARN — same
accepted pattern). **Tests: 41 unit + 86 integration (127)** green (+7 `realtime.test.ts` covering
the broadcast authorization boundary + that triggers don't break writes); `tsc`/`eslint`/`next
build`/e2e green. ⚠️ Live realtime *delivery* (websocket subscribe → receive) is a manual check, like
Web Push — the deterministic auth boundary is tested instead.

**Phase 6 (Microsoft Calendar) is DEFERRED to the post-launch backlog (2026-06-04).** A complete,
tested implementation was built — a provider-agnostic sync layer (`src/lib/calendar/*` +
a `CalendarAdapter` seam) with Google refactored into an adapter and a new Microsoft Graph adapter —
and it lives on branch **`feature/phase-6-microsoft-calendar`** (commit not merged). It's shelved
because finishing it requires registering an **Azure app**, which the owner can't do on a
work-restricted machine. No DB change is involved (the `calendars`/`events`/`category_overrides`
tables and the `calendar_provider` enum already accommodate `microsoft`), so reviving it later is
just: register the Azure app, set `MICROSOFT_CLIENT_ID/SECRET`, and merge the branch (see
[`docs/POST-LAUNCH.md`](docs/POST-LAUNCH.md) → *Calendar sync* and `docs/MICROSOFT-SETUP.md` on that
branch). **`main` remains the production-verified Google-only state.**

**Next: Phase 7 (visual design) is the last roadmap phase but is gated on product input — do not
start without the owner's direction** (references, accent, tone; see `DESIGN-PRINCIPLES.md`). Other
pre-launch work (OAuth verification, deploy) is owner-driven in
[`docs/PRE-LAUNCH.md`](docs/PRE-LAUNCH.md); backlog in [`docs/POST-LAUNCH.md`](docs/POST-LAUNCH.md).
Verify the live push round-trip against a production build + installed PWA once deployed (it can't be
exercised by `next dev` or the e2e suite).
