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

## Status / next step
**Resuming a session? Read [`docs/HANDOFF.md`](docs/HANDOFF.md) first** — full current-state handoff.

Spec complete; all product decisions settled. **Data model finalized** — see
[`docs/DATA-MODEL.md`](docs/DATA-MODEL.md). Design principles banked in
[`docs/DESIGN-PRINCIPLES.md`](docs/DESIGN-PRINCIPLES.md) (visual design deferred until after
P1's core loop). **Infra done:** Supabase project provisioned (Data API on, auto-expose off,
automatic RLS on); `.env.local` populated with Supabase URL + anon key; Resend auth email wired
via custom SMTP + branded templates ([`docs/EMAIL-SETUP.md`](docs/EMAIL-SETUP.md)).

**Phase 1 in progress.** Done: `profiles` migration (table + `handle_new_user()` signup trigger +
RLS, advisor-clean) applied via Supabase MCP and version-controlled in `supabase/migrations/`;
`@supabase/ssr` clients scaffolded (`src/lib/supabase/`: browser, server, generated `Database`
types) + `src/proxy.ts` (Next 16 renamed `middleware`→`proxy`) for session refresh + route gating;
starter leftovers cleaned (layout metadata, Geist font). `tsc` + `next build` both green.

Also done: `groups` + `group_members` migration — enums (`member_role`/`member_status`/
`join_control`), 15-member-cap trigger, owner-auto-membership trigger, `SECURITY DEFINER`
membership helpers (`is_group_member`/`is_group_admin`/`shares_group_with`) that break RLS
recursion, full RLS posture, and the now-unblocked co-member profile-read policy. Two follow-up
migrations fixed bugs the tests caught: re-granted helper `EXECUTE` to `authenticated`, and
admitted a group to its owner in the SELECT policy so `insert().select()` works.

Also done: `group_invites` + `pending_invites` migration (`20260604003050_create_invites`) —
admin-managed RLS on both tables; `get_invite_preview(token)` (SECURITY DEFINER, anon-callable
preview: name/inviter/member-count/join-policy only) and `redeem_group_invite(token)` (SECURITY
DEFINER, authenticated: open→active / approval→pending, idempotent, `use_count`/15-cap aware);
a `lower(trim())` email normaliser; and `handle_new_user()` extended to auto-join matching
`pending_invites` on signup (full-group `check_violation` swallowed so signup never fails).

**Testing set up** (see [`docs/TESTING.md`](docs/TESTING.md) — the durable strategy). Vitest with
two projects: **unit** (pure logic) and **integration** (drives the real supabase-js → RLS path
as actual signed-in users, against a **local Supabase stack** via Docker). 28 tests green, build
clean. Strategy: test what exists at the end of every phase; the Playwright/visual (run-as-user +
screenshot, then delete) layer is added once UI exists. Scripts: `test`, `test:unit`,
`test:integration`, `db:start`/`db:reset`/`db:stop`.

**Next:** `manual_blocks` → `my_busy_intervals` / `group_busy_intervals` busy-interval RPCs →
heatmap RPC, then the auth/group/invite UI.
Migrations go through the Supabase MCP **and** as files in `supabase/migrations/` (filenames must
match the remote ledger version so `supabase db push` won't replay them).
