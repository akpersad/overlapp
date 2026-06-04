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
P4 PWA polish (installable, push, offline, recurring).
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

**Testing** (see [`docs/TESTING.md`](docs/TESTING.md)): **27 unit + 53 integration (80)** green, plus a
**Playwright e2e/visual** layer (`npm run test:e2e`) driving the whole loop as a user against the
local stack (screenshots reviewed then deleted). `tsc`, `eslint`, `next build` all green. Scripts:
`test`, `test:unit`, `test:integration`, `test:e2e`, `db:start`/`db:reset`/`db:stop`.

**Migrations applied to BOTH local and the hosted PRODUCTION project via the Supabase MCP**
(4 new, ledger versions `20260604141324`→`141504`: calendar tables, availability-RPC extension,
avatars bucket, + an avatars-bucket hardening that drops the broad public-read/list policy).
`get_advisors(security)` is clean except the intentional `security_definer_function_executable`
WARNs and the **intentional** `calendar_secrets` RLS-enabled-no-policy INFO (that table is
service-role-only by design, §9-C). Local file names match the remote ledger versions. The live
Google OAuth round-trip still needs real credentials (manual verification per `GOOGLE-SETUP.md §5`).

**Next: Phase 3** — multi-date proposals, nudges, quorum, calendar write-back (`DATA-MODEL.md §10`).
