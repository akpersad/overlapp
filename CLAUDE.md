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
P6 Microsoft Calendar (the Google twin) → P7 visual design pass (gated on product input, last).
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
(`playwright.config.ts` now blanks `GOOGLE_*`/`MICROSOFT_*` and pins the local
`SUPABASE_SERVICE_ROLE_KEY` in the dev-server env, so e2e is deterministic regardless of
`.env.local`; no need to unset anything manually.)

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

**Phase 6 (Microsoft Calendar) is COMPLETE and tested (2026-06-04).** The architectural twin of
Google, built by **extracting a provider-agnostic sync layer** rather than copy-pasting: the
stateful orchestration (token refresh, windowed/incremental pull, busy-by-default upsert that never
clobbers the user's override, full-sync prune, write-back) now lives in `src/lib/calendar/sync.ts`
(`saveConnection`/`syncCalendar`/`syncDueCalendars`/`writeBackProposal`) and dispatches by `provider`
to a `CalendarAdapter` (`src/lib/calendar/types.ts`). Google was refactored into
`src/lib/google/adapter.ts` (its `oauth.ts`/`calendar.ts` helpers unchanged — same verified path);
Microsoft is the new `src/lib/microsoft/{oauth,calendar,adapter}.ts` using **Microsoft Graph**:
`calendarView/delta` (recurring series pre-expanded like Google's `singleEvents`; `@odata.deltaLink`
= the syncToken analog stored in `sync_cursor`; 410 → full resync), `Prefer: outlook.timezone="UTC"`,
busy-by-default `showAs` mapping (`free`/`workingElsewhere` → free), first Outlook category →
`category` for per-category overrides, and `events.create` write-back (UTC instant). New action
`connectMicrosoft` + route `/api/calendars/microsoft/callback` (added to proxy `PUBLIC_PATHS`); the
`/calendars` page shows both connect buttons gated by `googleConfigured()`/`microsoftConfigured()`.
**No migration needed** — the `calendars`/`events`/`category_overrides` tables and the
`calendar_provider` enum already had `microsoft`. Env: `MICROSOFT_CLIENT_ID/SECRET` (+ optional
`MICROSOFT_TENANT`, default `common`); absent → the Connect-Microsoft button is just omitted. Setup:
[`docs/MICROSOFT-SETUP.md`](docs/MICROSOFT-SETUP.md). **Tests: 54 unit + 87 integration (141)** green
(+13 `microsoft.test.ts` OAuth-URL + event-mapping, +1 integration proving the MS provider shares the
DB path); `tsc`/`eslint`/`next build`/e2e green. ⚠️ The **live Microsoft OAuth round-trip is NOT yet
verified** against a real account (no Azure app registered yet) — the deterministic pieces are tested;
consent → code exchange → sync is the remaining manual check (`docs/MICROSOFT-SETUP.md §5`).

**Phase 7 (visual design) is COMPLETE and verified (2026-06-05).** The whole app now runs on the
"Bright & Friendly" warm-social system from [`docs/DESIGN-BRIEF.md`](docs/DESIGN-BRIEF.md): honey
brand + deep-pine availability ramp + cream base, Bricolage Grotesque (display) + Inter (body), all
as semantic CSS-variable tokens in `src/app/globals.css` (mapped to Tailwind via `@theme inline`),
referenced through `src/lib/ui.ts` + a `/design` style-guide page. All 38 user-facing surfaces moved
off raw zinc/indigo (the heatmap hero uses the bucketed `--av-0..5` pine ramp + honey quorum
outline). Includes a **mobile bottom-tab-bar** nav (`BottomNav.tsx`) for the 375–430px phone target
and a tuned **dark mode** (warm charcoal; a constant `--on-accent` token carries dark text on bright
fills since `--ink` flips). `tsc`/`eslint`/`next build`/**141 unit+integration**/e2e green;
screenshot-reviewed light + dark at 1280px + 375px. Full record in `docs/HANDOFF.md`.

**Pre-launch functional fix (2026-06-05, branch `fix/pre-launch-functional`).** Resolved the
**all-day busy events block the wrong local day** bug (the one functional item in
`PRE-LAUNCH.md` "Known correctness issues"): `effective_event_busy_intervals` now expands each
all-day event into the **event owner's** local calendar day via `profiles.time_zone` (the tz column
already existed) before testing overlap; all three consumers (`my_busy_intervals`,
`group_busy_intervals`, `group_heatmap`) route through it, so one function fixes Google + Microsoft
with no app changes. Migration `20260605211948_fix_allday_busy_timezone` applied to local **and**
hosted production via MCP (advisors unchanged — the helper stays SECURITY INVOKER). **144
unit+integration** green (+3 in `availability.test.ts`); `tsc`/`eslint`/`next build` green. A minor
heatmap-vs-DST grid misalignment was newly logged in `PRE-LAUNCH.md` as a low-priority follow-up.

**Onboarding / invite-share polish (2026-06-05, same branch `fix/pre-launch-functional`).** Five
first-run fixes: (1) **invite share message + link preview** — personalized Web Share copy plus
`generateMetadata` on `/invite/[token]` + `metadataBase`/default Open Graph on the root layout, so a
pasted link renders a card not a bare URL; (2) **OG banner** — `scripts/generate-og-image.mjs` →
`public/og-image.png` (1200×630 brand Venn + wordmark), wired as `summary_large_image`; (3) **avatar
upload RLS bug fixed** — `uploadAvatar`/`removeAvatar` now do the storage write via the **service-role**
admin client (the SSR client wasn't attaching the session to storage requests; the action still
hard-scopes the `${user.id}/avatar` path), verified end-to-end against hosted — **now requires
`SUPABASE_SERVICE_ROLE_KEY`** (already required elsewhere); (4) **share-link invitees auto-join after
email confirmation** — new SECURITY DEFINER RPC `register_invite_signup` (migration
`20260606030000_share_link_invite_signup_bridge`, applied local **and** hosted) records a
`pending_invite` from the `signUp` action *before* `auth.signUp`, so the existing `handle_new_user`
trigger joins them with no email-template/redirect changes; (5) **PWA install hand-holding** —
`InstallPrompt` now shows numbered, platform-specific steps with the iOS Share / Add-to-Home glyphs.
Plus a consolidated **"Swap localhost → deployed URL"** section in `PRE-LAUNCH.md` (incl. the
easy-to-miss Supabase Auth Site URL + redirect allow-list). **146 unit+integration** green;
`tsc`/`eslint`/`next build` green; `get_advisors(security)` clean except the intentional items (the
new anon-callable `register_invite_signup` adds the expected anon + authenticated
`security_definer_function_executable` WARNs — same accepted pattern as `get_invite_preview`). e2e
deferred to the next session.

**Analytics + error tracking added (2026-06-06).** Two free-tier providers wired with a graceful
no-op fallback (absent keys → silent, like Google/MS/VAPID): **PostHog** (product analytics) +
**Sentry** (errors), both chosen because Claude can query them directly via their **MCP servers**
(declared in `.mcp.json`: `posthog`, `sentry`) for a hands-off weekly analysis loop. New:
`src/lib/analytics/{config,events,server}.ts`, `src/instrumentation-client.ts` (browser PostHog +
Sentry init, manual pageviews — `autocapture`/replay OFF for the free/busy-only privacy line),
`src/instrumentation.ts` (server Sentry init + `onRequestError`), `AnalyticsIdentify` in the `(app)`
layout (id-only, no PII). 10 funnel events emitted server-side from the core-loop actions
(signed_up → onboarding → group/invite → block/calendar → proposal create/lock); Sentry capture in
both error boundaries. **No Turbopack/`withSentryConfig`** (runtime capture only — no source-map
upload needed). Setup + the weekly prompt: [`docs/ANALYTICS.md`](docs/ANALYTICS.md). `tsc`/`eslint`/
`next build`/**146 unit+integration** green (build + tests ran with no keys → no-op path verified).
**Owner setup DONE (2026-06-06):** PostHog + Sentry accounts created; the `NEXT_PUBLIC_*` keys are
in `.env.local` (PostHog project 457176 "Default project", US; Sentry `personal-qbk/overlapp`, US);
both MCP servers approved + connected. **Verified end-to-end** — a live test event was ingested into
each and read back via MCP (PostHog event `overlapp_mcp_setup_check`; Sentry issue `OVERLAPP-1`, since
resolved). The keys + DSN match their projects exactly. Still pending: (1) the same `NEXT_PUBLIC_*`
vars (+ `NEXT_PUBLIC_ANALYTICS_ENV=production`) on the deploy; (2) a first run/deploy to confirm the
in-app instrumentation fires real data (the test events only prove the credential + transport, not the
app's own `$pageview`/funnel/error wiring). The weekly analysis loop is ready — see `docs/ANALYTICS.md`.

**Post-launch feedback fixes (2026-06-12, branch `feat/proposal-unlock-and-fixes`).** Five items from
real user feedback. (1) **Unlock proposals** — new `unlock_proposal` RPC (proposer/admin, `locked→open`,
clears `final_option`) + `unlockProposal` action that also **removes events written to members'
calendars** (new `deleteCalendarEvent` on the `CalendarAdapter` + both providers, driven by
`removeProposalWriteback` walking the `event_writebacks` ledger); manager-only **Unlock** button on
locked proposals. (2) **Duplicate-notification bug** (~9 "Event locked" in-app + pushes) root-caused:
`lock_proposal` updated unconditionally + returned void, so every repeat submit re-ran the notify +
write-back fan-out — now **transition-aware** (`open→locked` only, returns boolean) and `lockProposal`
only fans out on a real transition; lock/unlock are client components (`lock-controls.tsx`) that disable
while submitting. (3) **Heavier proposal copy** — lock button is now "Lock for everyone" behind a confirm
dialog; availability vs. group-decision copy clarified. (4) **OAuth-expired UX** — `invalid_grant` →
`reauth_required` so the calendar shows "Reconnect needed" + a one-click **Reconnect** button instead of
raw JSON (the token expires because Google caps Testing-mode refresh tokens at **7 days** — documented in
`PRE-LAUNCH.md`; fix = publish to Production). (5) `proposal_unlocked` notification kind. **Migration
`20260612000000_proposal_unlock_and_idempotent_lock` applied to local + hosted PRODUCTION via MCP**;
`database.types.ts` regenerated. **61 unit + 95 integration (156)** green; `tsc`/`eslint`/`next build`
green; advisors clean except the documented intentional WARNs (the new `unlock_proposal`/recreated
`lock_proposal` add the same accepted `security_definer_function_executable` pattern). Full record in
`docs/HANDOFF.md`.

**LIVE as of 2026-06-13** at `https://overlapp-psi.vercel.app` (Vercel free Hobby, **no custom
domain**). Verified done on the deploy: Supabase Auth URL config, `NEXT_PUBLIC_SITE_URL`, Google
prod redirect URI + JS origin, PostHog/Sentry env vars. Leaked-password protection is **accepted
off** (Supabase Pro-only — staying free tier). Full live-status snapshot in
[`docs/PRE-LAUNCH.md`](docs/PRE-LAUNCH.md) "Live status (2026-06-13)".

**Custom-domain blocker (deferred — owner not buying a domain for a while, see
[[no-custom-domain-yet]]):** `overlapp.app` is unregistered, so `privacy@`/`admin@` are dead
mailboxes, email DMARC can't be set, and Google OAuth **verification** is blocked
(`*.vercel.app` is unverifiable). These all wait on a domain purchase. Independent of the domain:
Google OAuth can still be **published Testing→Production** to remove the 7-day refresh-token cap.

**Next (no-domain-needed):** publish Google OAuth to Production; verify the Vercel cron fired +
`CRON_SECRET` is set; confirm Resend's actual sending domain + its DMARC; verify the live push
round-trip against a production build + installed PWA (can't be exercised by `next dev`/e2e).
Backlog in [`docs/POST-LAUNCH.md`](docs/POST-LAUNCH.md).
