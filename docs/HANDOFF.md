# Overlapp — Session Handoff

> Created 2026-06-03. Purpose: let a fresh Claude Code session resume exactly where the
> previous one left off. Read this first, then `CLAUDE.md` → `docs/SPEC.md` → `docs/DATA-MODEL.md`.

## TL;DR — where we are

**Roadmap status (updated 2026-06-04):** Phases 1–5 are built, tested, and on `main`. **Phase 6
(Microsoft Calendar) is DEFERRED to the post-launch backlog** — a complete, tested implementation
was built (a provider-agnostic sync layer + a `CalendarAdapter` seam; Google refactored into an
adapter + a new Microsoft Graph adapter) and lives on branch **`feature/phase-6-microsoft-calendar`**
(not merged), but it's shelved because finishing it requires registering an **Azure app**, which the
owner can't do on a work-restricted machine. No DB change is involved, so reviving it is "register
the app → set `MICROSOFT_CLIENT_ID/SECRET` → merge the branch" (see `docs/POST-LAUNCH.md` →
*Calendar sync*, and `docs/MICROSOFT-SETUP.md` on that branch). **`main` is the production-verified
Google-only state.** The only remaining roadmap phase is **Phase 7 (visual design), which is gated
on product input** — don't start it without the owner's direction.

**Phase 5 (launch readiness & UX polish) is COMPLETE and tested (2026-06-04).** Built on branch
`feature/phase-5` (off `main` @ `24ced09`, which has P1–P4 via PR #7). Phases 5–7 were added to the
roadmap after P1–P4 shipped (see `docs/SPEC.md` Roadmap): P5 here, **P6 Microsoft Calendar**
(now deferred — see above), **P7 visual design** last (gated on product input). Three P5 deliverables:
- **Public legal pages** — `/privacy` + `/terms` in route group `src/app/(legal)/` (shared chrome in
  `layout.tsx`, shared bits in `ui.tsx`), added to the proxy `PUBLIC_PATHS`, linked from the landing
  footer. Cover what we collect, the free/busy-only model, **Google Limited Use**, retention +
  account deletion, and a contact email (`CONTACT_EMAIL` in `ui.tsx` is a placeholder — confirm a
  real monitored mailbox before going public; flagged in `PRE-LAUNCH.md`).
- **Realtime heatmap** — AFTER triggers call `realtime.send` with a **group-id-only** payload (never
  event data) to a **private** per-group topic `group-availability:<id>` whenever manual_blocks /
  events / category_overrides / group_members / groups change. Receiving is authorized by a
  `realtime.messages` SELECT policy → `public.can_read_group_broadcast(topic)` → `is_group_member`,
  so only active members get a group's doorbell. The heatmap client (`heatmap.tsx`) calls
  `supabase.realtime.setAuth()` then subscribes (`private: true`) and silently re-fetches the current
  week on receipt (400 ms debounce coalesces a bulk calendar sync into one refetch). Privacy model
  intact: the broadcast is a doorbell, the de-identified `group_heatmap` RPC is still the only data path.
- **Transfer-on-delete** — `deleteAccount` now accepts `transfer:<groupId>` form fields; for each
  owned group the user picks another active member to receive ownership (via the existing
  `transfer_group_ownership` RPC, run as the still-owner) or lets it dissolve. The profile page
  gathers eligible new owners (admins first) per owned group; `delete-account.tsx` renders a select
  per group, defaulting to transfer so groups survive by default.
- **Migration:** 1 applied to local **and** hosted PRODUCTION via MCP (ledger version
  `20260604211816` realtime_availability_broadcast; local filename matches). `get_advisors(security)`
  clean except the same intentional WARNs (new `can_read_group_broadcast` adds the expected
  `security_definer_function_executable` WARN).
- **Tests:** **41 unit + 86 integration (127)** green (+7 `realtime.test.ts`: broadcast-authorization
  boundary + triggers-don't-break-writes). `tsc`, `eslint`, `next build`, e2e all green (e2e run with
  Google env unset, as before). ⚠️ Live realtime *delivery* (websocket subscribe → receive) is a
  manual check, like Web Push — the deterministic auth boundary is what's unit/integration-tested.

**Next: Phase 6 (Microsoft Calendar) — DEFERRED to the post-launch backlog (see the status banner at
the top of this TL;DR).** The implementation is done and parked on branch
`feature/phase-6-microsoft-calendar`; it's blocked only on registering an Azure app. The next
*actionable* roadmap phase is Phase 7 (visual design), which is gated on owner product input.

---

**Phase 4 (PWA polish) is COMPLETE and tested (2026-06-04).** Built on branch
`feature/phase-4-pwa` (off `main` @ `392b029`, which has P1–P3 via PR #6). All four P4 deliverables:
- **Installable PWA** — `src/app/manifest.ts` (served at `/manifest.webmanifest`), generated
  "overlap" Venn-mark icons in `public/icons/` (`scripts/generate-icons.mjs`, dependency-free PNG
  encoder), and root-layout PWA metadata (`theme-color`, `apple-touch-icon`, `appleWebApp`).
- **Service worker** — `public/sw.js` (registered by `src/components/ServiceWorker.tsx`,
  **production-only** so it doesn't fight Turbopack HMR): app-shell precache, navigation
  network-first → cache → `/offline` fallback, hashed-asset cache-first, plus `push` /
  `notificationclick` handlers. New public route `src/app/offline/page.tsx` (+ proxy public paths
  `/sw.js`, `/manifest.webmanifest`, `/offline`).
- **Web Push** — `web-push` dep + VAPID keys (`.env.local`, `.env.example`). New table
  `push_subscriptions` (self-manage RLS + service-role grant). `src/lib/push.ts` (`sendPushToUsers`,
  prunes dead 404/410 endpoints) is wired **into `notifyUsers`** so every existing in-app
  notification (proposal create/lock/cancel/nudge) also pushes — one fan-out, two channels, push
  best-effort. Subscription mgmt via `src/lib/actions/push.ts` + `src/components/PushToggle.tsx`
  (profile "Notifications" card + onboarding `InstallPrompt`, which only offers push when running
  installed/standalone, per spec §Onboarding).
- **Offline group calendar** — the heatmap caches each loaded week in `localStorage` and renders
  the last saved week with an "Offline — showing the last saved availability" banner when the RPC
  is unreachable (`heatmap.tsx`).
- **Recurring hangouts** — new table `recurring_hangouts` (admin-write / member-read RLS), stored
  like a manual block (anchor + `rrule`) so the tested `expand_block_occurrences` powers the new
  `upcoming_hangouts(group_id, horizon)` RPC. Group page lists each hangout + its next occurrence
  with a **"Propose this"** link that pre-seeds the Phase-3 proposal form (`ProposeForm` now accepts
  `initialTitle/Start/End`; `/proposals/new` reads them from searchParams). Admin create/delete via
  `src/lib/actions/hangouts.ts` + `hangout-form.tsx`.
- **Setup:** [`docs/PWA-SETUP.md`](PWA-SETUP.md) (VAPID keys; absent → push silently disabled, app
  unaffected).
- **Tests:** **41 unit + 79 integration (120)** green (+2 unit from the service-role parity guard
  gaining `push_subscriptions`; +14 integration: `push.test.ts` ×6, `hangouts.test.ts` ×8). `tsc`,
  `eslint`, `next build`, and e2e all green (e2e run with Google env unset, as before).
- **Migrations:** 2 applied to local **and** hosted PRODUCTION via MCP (ledger versions
  `20260604183848` create_push_subscriptions, `20260604183918` create_recurring_hangouts; local
  filenames match). `get_advisors(security)` clean except the same intentional WARNs (the new
  `upcoming_hangouts` adds the expected member-gated `security_definer_function_executable` WARN,
  same pattern as `group_heatmap`) + the pre-existing `auth_leaked_password_protection` auth-config
  WARN (not introduced by P4).

**Phase 4 is the last roadmap phase.** Remaining before launch: see [`docs/PRE-LAUNCH.md`] (legal
pages, OAuth verification, deploy) and the post-launch backlog ([`docs/POST-LAUNCH.md`]) — incl.
Microsoft/Apple calendars, Vault token encryption, and the parked "how to install the PWA" walkthrough.

---

**Phase 3 (multi-date proposals) is COMPLETE and tested (2026-06-04).** Built this session on the
branch `feature/phase-3-proposals` (off `main` @ `40a76cc`, which now has P1+P2 via PR #5):
- **Proposals** — a member seeds candidate slots (`/groups/[id]/proposals/new`); the group marks
  yes/no/maybe per option, **pre-filled** from their general availability (`suggest_proposal_rsvps`,
  SECURITY INVOKER); `proposal_results` computes the per-option overlap tally + a **quorum** verdict;
  the proposer/admin **locks** the final slot (`lock_proposal`) or **cancels** it. DB: `proposals` +
  `proposal_options` + `proposal_responses` with member-read / proposer-or-admin-write / self-response
  RLS, the `proposal_group_id` + `can_manage_proposal` definer helpers, and the `create_proposal`
  RPC (atomic insert of proposal + options).
- **Quorum** — `groups.quorum` (null = everyone) now drives `group_heatmap` (extended with
  `quorum`/`meets_quorum` columns — drop+recreate) and the heatmap UI outlines "good enough" slots
  (a shape cue, not a second hue → colourblind-safe). Editable on group create/edit.
- **Notifications + nudges** — in-app only (Web Push is P4). `notifications` table, written
  server-side via the service role (`src/lib/notifications.ts`) on proposal create/lock/cancel and
  the proposer's "nudge non-responders" action. `/notifications` inbox + an unread badge in `AppNav`.
- **Calendar write-back** — opt-in per calendar (`calendars.writeback_enabled`). On lock,
  `writeBackProposal` (service role) pushes the chosen slot to each opted-in member's Google calendar
  (`insertCalendarEvent`), idempotent via the `event_writebacks` ledger, best-effort per member.
  The writable `calendar.events` scope is in `GOOGLE_SCOPES` **and has been declared in the Google
  Console → Data Access (done by the user, 2026-06-04)**, so new connections request + grant it.
  ⚠️ **Pre-P3 connections still hold read-only tokens — they must disconnect + reconnect** to grant
  write access (else write-back fails with `insufficient_scope`; the Calendars page surfaces a
  reconnect hint). **VERIFIED against production (2026-06-04):** after the user reconnected
  (granting `calendar.events`), the exact server write path — token refresh + Google
  `events.insert` against the stored credentials — created a real event in their calendar. The
  full in-app *lock → writeBackProposal* orchestration (which also writes the `event_writebacks`
  ledger row) reuses that same verified call; driving it through the UI is the only remaining
  manual check.
- **Tests:** `tests/integration/proposals.test.ts` (12) covers the RPCs + RLS + quorum heatmap; the
  service-role parity guard now lists `notifications` + `event_writebacks`. **39 unit + 65
  integration (104)** green; `tsc`/`eslint`/`next build` green; e2e green (run with Google env unset).
- **Migrations:** 4 applied to local **and** hosted via MCP (`20260604154425`→`154507`).
  `get_advisors(security)` clean except the same intentional WARNs.

**Next: Phase 4** — PWA polish (installable, Web Push for proposals/nudges, offline, recurring).

---

**Phase 2 (calendar sync) is COMPLETE and tested (2026-06-04)**, along with the remaining P1
follow-ups (avatar upload + account deletion). Built this session:
- **Google Calendar OAuth** — a standalone *calendar-access* flow (NOT login): `connectGoogle()`
  → consent (`access_type=offline&prompt=consent`) → `/api/calendars/google/callback` exchanges
  the code, stores tokens in **`calendar_secrets`** (service-role-only; never client-readable,
  §9-C), writes a **`calendars`** metadata row, and runs a first sync.
- **Sync worker** (`src/lib/google/{oauth,calendar,sync}.ts` + `src/lib/supabase/admin.ts`):
  refreshes tokens, pulls `calendar.readonly` events for a −1d…+60d window (`singleEvents=true`),
  **upserts** into **`events`** *without* clobbering the user's `override`. Incremental via
  Google `syncToken` (`calendars.sync_cursor`); 410 → full resync.
- **Overrides** — per-event + per-category (**`category_overrides`**) free/blocked. Effective busy
  = event override → category rule → `provider_busy`, resolved in the **extended availability RPCs**
  (new `effective_event_busy_intervals` helper folded into `my_busy_intervals` /
  `group_busy_intervals` / `group_heatmap` — same signatures, so the heatmap UI was unchanged).
- **Background re-sync** — `/api/cron/sync-calendars`, `CRON_SECRET`-bearer-protected (Vercel Cron
  or any pinger). **`/calendars` page** drives connect/disconnect/sync-now + the override toggles.
- **P1 follow-ups** — avatar upload (public `avatars` storage bucket + owner-scoped RLS) and
  account deletion (dissolves owned groups + deletes the auth user via the service role).
- **Setup:** [`docs/GOOGLE-SETUP.md`](GOOGLE-SETUP.md). Without `GOOGLE_CLIENT_ID/SECRET` the
  Calendars page shows a "not configured" notice and the rest of the app is unaffected.

**Migrations are applied to BOTH local and the hosted PRODUCTION project** (5 new, ledger versions
`20260604141324`→`145228`; local filenames match the remote ledger). The last one adds explicit
`service_role` grants on server-written tables (calendars/events/groups) — the hosted project has
auto-expose OFF, so those grants aren't implicit like they are locally (a parity gap now guarded by
`tests/unit/service-role-grants.test.ts`). `get_advisors(security)` is
clean except the intentional `security_definer_function_executable` WARNs and the intentional
`calendar_secrets` RLS-enabled-no-policy INFO (service-role-only by design, §9-C). Applying tested
migrations to the hosted project via MCP is now standing practice (test locally first).

**The live Google OAuth round-trip is VERIFIED end-to-end against production (2026-06-04):** the
user created a Web OAuth client, set `GOOGLE_CLIENT_ID/SECRET` in `.env.local`, and a real connect
(consent → code exchange → tokens in `calendar_secrets` → first sync into `events`) landed on
`/calendars?connected=1` with events synced. Two setup gotchas hit + documented in
`GOOGLE-SETUP.md`: (1) testers must be added under the consent screen's **Test users** (else
`Error 403: access_denied`); (2) the `calendar.readonly` scope is declared under **Data Access**.
The `service_role`-grants fix above was found *because* of this live test (it 403'd until granted).

**Next: Phase 3** (multi-date proposals — `DATA-MODEL.md §10`).

---

**Phase 1 is COMPLETE and tested (2026-06-04).** The full core loop works end-to-end: auth
(signup/login/verify/logout), onboarding, profile, dashboard, group create/edit/manage, the
invite flow (Web Share token links + email-keyed pending invites + public preview + redeem),
the manual-block availability editor (incl. weekly RRULE), and the **group heatmap** rendered in
the viewer's local time. Backend: all P1 migrations applied **locally and to the hosted project
via MCP** — `manual_blocks`, the availability RPCs (`expand_block_occurrences` RRULE expander,
`my_busy_intervals`, de-identified `group_busy_intervals`, on-the-fly `group_heatmap`), the group
management RPCs (`dissolve_group` = the §9-E soft-delete write path, `transfer_group_ownership`,
a role-integrity guard), and a `pending_member_visibility` fix. Security advisors: only the
intentional `security_definer_function_executable` WARNs.

**Next: Phase 3** — multi-date proposals, nudges, quorum, calendar write-back (`DATA-MODEL.md §10`).
(Phase 2 calendar sync is done — see the TL;DR above and `docs/GOOGLE-SETUP.md`.)

**Testing.** `docs/TESTING.md` is the durable strategy: **35 unit + 53 integration (88) green**,
plus a **Playwright e2e/visual layer** (`npm run test:e2e`) that drives the whole loop as a user,
screenshots every screen, and deletes the screenshots after review. Run integration/e2e against
the **local** stack (`npm run db:start` → `npm run db:reset` → `npm run test` / `npm run
test:e2e`). After any migration: `npm run db:reset` + regenerate DB types. Never run against the
hosted project.

**Soft-delete (was a TODO, now RESOLVED):** a direct `UPDATE deleted_at` is blocked by RLS, so
group dissolution goes through the `dissolve_group(uuid)` `SECURITY DEFINER` RPC
(`…_create_group_management_rpcs`; `DATA-MODEL.md §9-E`). Covered by `group-management.test.ts`.

## Why this handoff exists

Continuity between sessions: lets a fresh Claude Code session resume without re-deriving state.

**Supabase MCP is connected and working** (used to apply migrations this session). If a new
session shows it disconnected: run `/mcp` → authenticate (browser OAuth). MCP servers load only
at startup, so a freshly-edited `.mcp.json` needs a restart.

## Project facts

- **Path:** `/Users/apersad/Documents/Development/PersonalProjects/overlapp`
- **Stack:** Next.js 16.2.7 (App Router, Turbopack), React 19.2.4, TypeScript, Tailwind 4,
  `src/` dir, `@/*` alias. Supabase backend. Mobile-first PWA.
- **⚠️ Next.js 16 caveat:** This Next.js has breaking changes vs. training-data knowledge
  (see `AGENTS.md`). **Read `node_modules/next/dist/docs/` before writing app code** — esp.
  async `cookies()`/`headers()` and middleware patterns, which matter for `@supabase/ssr`.
- **Git:** repo at `overlapp/`. `main` is at `b26f8fb` (foundation + groups + invites + the full
  Phase 1 app, PRs #1–#4). **All Phase 1 follow-ups + Phase 2 are committed on branch
  `feature/phase-1-completion-and-phase-2`** (6 commits ahead of `main`) — **not yet pushed or
  PR'd** (awaiting the user's go-ahead). The session's first move was un-committing a stray
  docs-only commit off `main` and re-landing it on this branch.
- **Supabase project ref:** `qildwjcnzyejgjvnyohi` (Americas region). ⚠️ **This is the PRODUCTION
  project — there is no separate dev project.** Always develop + test against the **local** stack
  first (`db:reset` + full suite green) before applying anything here. Security settings: Data API
  ON, auto-expose-new-tables OFF, automatic-RLS ON (new tables get RLS auto-enabled → every table
  needs explicit grants + policies in its migration or it's deny-all).

## What's DONE

### Documentation (all committed)
- `docs/SPEC.md` — product spec (problem, decisions, journeys, roadmap). Source of truth.
- `docs/DATA-MODEL.md` — **finalized** Postgres/Supabase schema, RLS posture, build order (§12).
  Locked decisions: RRULE recurrence · server-only OAuth tokens · soft-delete (`deleted_at`)
  · on-the-fly heatmap RPC for P1 · email mirrored into `profiles` via signup trigger.
  (P2 implemented the §9-C **service-role-only** token store — `calendar_secrets` with no Data-API
  grants — rather than Vault encryption-at-rest; Vault is a post-launch hardening item.)
- `docs/GOOGLE-SETUP.md` — Google Calendar OAuth + sync setup (P2). `docs/POST-LAUNCH.md` —
  non-MVP backlog, free-tier-first.
- `docs/DESIGN-PRINCIPLES.md` — anti-AI-slop UI guardrails. Visual design was deferred until P1's
  core loop worked; that gate has **now cleared**, so a deliberate design pass is unblocked.
  Sketch/reference-first; heatmap is the hero; one accent color; color must survive colorblindness.
- `docs/EMAIL-SETUP.md` + `docs/email-templates/*.html` — Resend auth email.

### Infra
- **Supabase project** provisioned (ref above).
- **`.env.local`** has `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` +
  `SUPABASE_SERVICE_ROLE_KEY` (all pointing at the **hosted production** project — so `next dev`
  reads/writes prod) and the Phase 2 `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. `CRON_SECRET` is
  not set locally (only needed for the deployed cron). `.env.example` is the committed template;
  `.env*` is gitignored. NB: e2e/integration tests override the Supabase vars to the **local** stack.
- **Resend auth email** wired: custom SMTP (`smtp.resend.com:465`, user `resend`, pass = API key),
  sending from `noreply@payroll.persadpay.com`. Branded templates in `docs/email-templates/`
  (user pastes into Supabase → Authentication → Emails → Templates).
  - DNS for `persadpay.com` is at **Vercel** (registered at GoDaddy, nameservers → Vercel).
  - Deliverability: user adding a **DMARC** TXT record at Vercel
    (`_dmarc` → `v=DMARC1; p=none; rua=mailto:akpersad@gmail.com`). Status: in progress / verify.
- **Supabase MCP server** configured in `.mcp.json` (hosted HTTP `mcp.supabase.com`,
  scoped to project ref, OAuth — no token in repo). **Mode: WRITE-enabled** (user chose this; MCP
  can run migrations/SQL directly). **Connected and in active use** (applied the invites migration).
- **Supabase CLI** also installed (`npx supabase`, v2.104.0) as a devDependency — fallback/option
  for versioned migrations. Docker is available for `supabase start` (local dev) if wanted.

### Phase 1 — application code (first slice, committed)

- **`profiles` migration** (`supabase/migrations/`), applied via the Supabase MCP and saved as
  files whose names match the remote ledger version (so `supabase db push` won't try to replay):
  - `…_create_profiles.sql` — `public.profiles` (email mirror + soft-delete `deleted_at`), a
    shared `set_updated_at()` trigger, the `handle_new_user()` signup trigger (mirrors
    `auth.users` → profile; reads `first_name`/`last_name`/`time_zone` from signup metadata),
    RLS enabled with **self read/update** policies + `authenticated` grants.
  - `…_harden_trigger_functions.sql` — pins `set_updated_at`'s `search_path` and revokes RPC
    `EXECUTE` on the trigger funcs. Security advisor now clean except Supabase's own
    `rls_auto_enable` (platform function, not ours).
  - **Deferred on purpose** (tables don't exist yet, noted in the SQL): co-member profile-read
    policy → comes with `group_members`; `pending_invites` auto-join → extends
    `handle_new_user()` in the invites migration.
- **`@supabase/ssr` scaffold** under `src/lib/supabase/`: `config.ts` (validated env),
  `client.ts` (browser), `server.ts` (async-`cookies()` server client), `database.types.ts`
  (generated — regenerate after every migration). 
- **`src/proxy.ts`** — Next 16 renamed `middleware`→`proxy` (`export function proxy`, **Node
  runtime only**, `getAll`/`setAll` cookie pattern). Refreshes the session + gates routes; public
  prefixes: `/`, `/login`, `/signup`, `/verify-email`, `/auth`, `/invite` (all now built).
  NOTE: proxy is **not** a hard security boundary — RLS + per-action auth checks are.
- **Starter cleanup:** `layout.tsx` metadata and the `globals.css` Arial override fixed (done in
  the first slice); landing `page.tsx` rewritten as the real marketing page.
- **Verified:** `tsc --noEmit`, `eslint`, and `next build` all green.
- The multiple-lockfiles `next build` warning is silenced via `turbopack.root` in
  `next.config.ts` (also sets `allowedDevOrigins: ['127.0.0.1']` for the Playwright dev server).

### Phase 1 — migrations since the first slice

- **`groups` + `group_members`** (`20260603210859` + fixes `…211217`, `…214316`): enums, 15-cap
  trigger, owner-auto-membership, `SECURITY DEFINER` membership helpers, full RLS.
- **`group_invites` + `pending_invites`** (`20260604003050_create_invites`): token-link invites,
  `get_invite_preview`/`redeem_group_invite` RPCs, email normaliser, `handle_new_user()` auto-join.
- **`manual_blocks`** (`20260604032458`): owner-only RLS, RRULE column, time-order check.
- **availability RPCs** (`20260604032606`): `expand_block_occurrences` (RRULE expander, UTC-pinned,
  bounded iteration; supports FREQ DAILY/WEEKLY/MONTHLY + INTERVAL/COUNT/UNTIL/BYDAY),
  `my_busy_intervals` (SECURITY INVOKER), de-identified `group_busy_intervals` (member-gated, no
  label — the privacy boundary), on-the-fly `group_heatmap` (member-gated, everyone-free flag,
  45-day window cap).
- **group management RPCs** (`20260604032639`): `dissolve_group` (the §9-E soft-delete write path),
  `transfer_group_ownership`, and a `guard_member_role` trigger enforcing the single-owner /
  no-direct-owner-promotion invariant.
- **`pending_member_visibility`** (`20260604032655`): self-row SELECT policy on `group_members` +
  an any-status `has_group_membership()` group SELECT policy, so a pending member sees the group
  (and the post-redeem redirect resolves) but still gets no member availability.

All four were applied via the Supabase MCP to the hosted project and saved as files whose
timestamps match the recorded ledger versions. `get_advisors` (security) shows only the intentional
`security_definer_function_executable` WARNs.

### Phase 1 — application UI (complete)

Full app under `src/app/` (Next 16 App Router, Server Actions, `@supabase/ssr`):
- **Public:** landing (`page.tsx`), `login`, `signup`, `verify-email`, `auth/confirm` (email-OTP
  route handler), `invite/[token]` (public preview via `get_invite_preview` + redeem).
- **Authenticated** (route group `(app)`, shell in `(app)/layout.tsx` with `AppNav`): `onboarding`,
  `profile`, `dashboard`, `groups/new`, `groups/[id]` (heatmap + members + invites + approvals +
  dissolve/leave/transfer), `groups/[id]/edit`, `availability` (block editor).
- **Shared:** Server Actions in `src/lib/actions/{auth,groups,profile,blocks}.ts`; DAL
  `src/lib/auth.ts` (`getUser`/`requireUser`/`requireProfile`, React-`cache`d); pure helpers
  `src/lib/{format,rrule,ui}.ts`; components `src/components/{AppNav,AuthCard,Avatar,LocalTime}.tsx`.
- **Heatmap** (`groups/[id]/heatmap.tsx`, client): weekly grid in viewer-local time, single-hue
  intensity ramp + free-count text (colourblind-safe), week nav, queries `group_heatmap`.
- **Invites** use the **Web Share API** (native share sheet) with clipboard fallback.

## Phase 1 build log (all DONE)

Every step of the `DATA-MODEL.md §12` build order shipped. Kept here as the decision/bug record;
**there is nothing left to do in Phase 1 — start Phase 2** (see TL;DR).

1. ~~**`groups` + `group_members`** migration (`DATA-MODEL.md §3`): two tables, the enums
   (`member_role`, `member_status`, `join_control`), the **15-member-cap** trigger, and RLS
   (members read; admins/owner write); unlocks the co-member profile-read policy.~~ **DONE.**
2. ~~**`group_invites` + `pending_invites`** (`§4`–`§5`): token-link invites, email-keyed pending
   invites, the invite-preview `security definer` RPC, and **extend `handle_new_user()`** to
   consume `pending_invites` on signup (the auto-join).~~ **DONE** — migration
   `20260604003050_create_invites` (applied via MCP + file). Adds both tables with admin-managed
   RLS; `get_invite_preview(token)` (SECURITY DEFINER, anon + authenticated — name/inviter/
   member-count/join-policy only, no roster/availability; empty for revoked/expired/used-up);
   `redeem_group_invite(token)` (SECURITY DEFINER, authenticated — open→active / approval→pending,
   idempotent, `FOR UPDATE` + `use_count` bump, 15-cap still applies); a `lower(trim())` email
   normaliser trigger; and `handle_new_user()` extended to consume matching `pending_invites` on
   signup (per-group attempt wrapped so a full group's `check_violation` is skipped, never blocking
   account creation). 12 integration tests added (`tests/integration/invites.test.ts`).
   Advisor note: `get_invite_preview`/`redeem_group_invite` show WARN
   `*_security_definer_function_executable` — **intentional** (client-callable RPCs), same accepted
   pattern as the existing `is_group_*`/`shares_group_with` helpers.
3. ~~**`manual_blocks`** (`§7`) → **`my_busy_intervals` / `group_busy_intervals`** + **heatmap
   RPC** (`§8`, on-the-fly per `§9-B`).~~ **DONE** — migrations `…_create_manual_blocks`,
   `…_create_availability_rpcs`, `…_create_group_management_rpcs` (+ `dissolve_group` resolving the
   §9-E soft-delete TODO), `…_pending_member_visibility`. Integration: `availability.test.ts`,
   `group-management.test.ts`.
4. ~~Then the UI: auth, group create/join + invite share/preview/redeem flow, manual-block
   editor, heatmap.~~ **DONE** — full app under `src/app/` (route group `(app)` for the
   authenticated shell; `login`/`signup`/`verify-email`/`auth/confirm`/`invite/[token]` public).
   Server Actions in `src/lib/actions/`, DAL in `src/lib/auth.ts`, pure helpers in
   `src/lib/{format,rrule,ui}.ts`. Playwright e2e in `tests/e2e/`.

**→ Phase 1 is finished. Continue with Phase 2 (calendar sync) — see TL;DR above.**

**Migration workflow reminder:** apply via Supabase MCP `apply_migration` **and** save a matching
file in `supabase/migrations/` whose timestamp matches the version the ledger recorded (check with
MCP `list_migrations`), then regenerate `src/lib/supabase/database.types.ts`. Run `get_advisors`
(security) after DDL and clear anything you introduced. Never edit an already-applied migration —
add a new one.

## Open decisions / reminders

- **Visual design** was deferred until P1's core loop worked — it now does, so a proper design
  pass (per `DESIGN-PRINCIPLES.md`: sketch-first, heatmap-as-hero, one accent, colourblind-safe) is
  now **unblocked**. Current UI is intentionally functional/minimal Tailwind, not the final look.
- **Auth:** email+password is built. Google OAuth login is still optional/later (doubles as
  calendar consent in P2). Local Supabase has `enable_confirmations = false` (signups auto-confirm,
  which is what e2e relies on); **prod will confirm by email** — the `/auth/confirm` route + the
  `verify-email` page handle that path, and Resend prod email depends on DMARC landing.
- **Account deletion UI** and **avatar upload** are now **built** (this session). Deletion
  dissolves owned groups + deletes the auth user via the service role (profile page → Danger zone);
  avatar upload uses the public `avatars` storage bucket with owner-scoped RLS.
- **PWA** (installable manifest, service worker, Web Push) is **Phase 4**, not done.
- **MCP write mode is enabled against the PRODUCTION DB** (convenience + prompt-injection risk).
  No real user data yet, but treat every MCP `apply_migration`/`execute_sql` as a production change:
  test locally first, prefer reversible DDL, and consider switching the MCP server to read-only
  (or spinning up a separate dev project / branch) before real users land.

## Persistent memory

This in-repo file (plus `CLAUDE.md`) is the authoritative, detailed handoff — read it first.
(If a user-level `overlapp-project` memory note exists from an earlier session, treat this file as
the source of truth where they disagree.)
