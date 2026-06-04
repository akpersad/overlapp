# Overlapp — Session Handoff

> Created 2026-06-03. Purpose: let a fresh Claude Code session resume exactly where the
> previous one left off. Read this first, then `CLAUDE.md` → `docs/SPEC.md` → `docs/DATA-MODEL.md`.

## TL;DR — where we are

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

**Next: Phase 2** — Google Calendar OAuth + import (busy-by-default), the free/blocked override
system (per-event + per-category), background re-sync. See `DATA-MODEL.md §6` (calendars/events/
category_overrides) and the spec roadmap.

**Testing.** `docs/TESTING.md` is the durable strategy: **16 unit + 41 integration (57) green**,
plus a **Playwright e2e/visual layer** (`npm run test:e2e`) that drives the whole loop as a user,
screenshots every screen, and deletes the screenshots after review. Run integration/e2e against
the **local** stack (`npm run db:start` → `npm run db:reset` → `npm run test` / `npm run
test:e2e`). After any migration: `npm run db:reset` + regenerate DB types. Never run against the
hosted project.

**Soft-delete TODO (caught by tests):** a direct `UPDATE deleted_at` is blocked by RLS, so group
dissolution needs a `SECURITY DEFINER` RPC — build it with group management (`DATA-MODEL.md §9-E`).

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
- **Git:** repo at `overlapp/`. `main` has the foundation + groups work merged (PRs #1, #2).
  Invites work is committed on branch **`feature/invites`** (not yet pushed/PR'd).
- **Supabase project ref:** `qildwjcnzyejgjvnyohi` (Americas region). Security settings:
  Data API ON, auto-expose-new-tables OFF, automatic-RLS ON (new tables get RLS auto-enabled →
  every table needs explicit grants + policies in its migration or it's deny-all).

## What's DONE

### Documentation (all committed)
- `docs/SPEC.md` — product spec (problem, decisions, journeys, roadmap). Source of truth.
- `docs/DATA-MODEL.md` — **finalized** Postgres/Supabase schema, RLS posture, build order (§12).
  Locked decisions: RRULE recurrence · Vault server-only OAuth tokens · soft-delete (`deleted_at`)
  · on-the-fly heatmap RPC for P1 · email mirrored into `profiles` via signup trigger.
- `docs/DESIGN-PRINCIPLES.md` — anti-AI-slop UI guardrails. **Visual design DEFERRED** until
  after P1's core loop works. Sketch/reference-first; heatmap is the hero; one accent color;
  color must survive colorblindness.
- `docs/EMAIL-SETUP.md` + `docs/email-templates/*.html` — Resend auth email.

### Infra
- **Supabase project** provisioned (ref above).
- **`.env.local`** populated by the user with `NEXT_PUBLIC_SUPABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `.env.example` is the committed template. `.env*` is gitignored.
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
  runtime only**, `getAll`/`setAll` cookie pattern). Refreshes the session + gates routes: only
  `/` and the future auth/invite paths are public; others redirect to `/login` (not built yet).
  NOTE: proxy is **not** a hard security boundary — RLS + per-action auth checks are. 
- **Starter cleanup:** `layout.tsx` metadata (was "Create Next App") and the `globals.css` Arial
  override (was clobbering Geist) fixed.
- **Verified:** `tsc --noEmit` clean; `next build` green and shows `ƒ Proxy (Middleware)`.
- Known cosmetic warning: `next build` reports multiple lockfiles (a stray
  `package-lock.json` one dir up in `PersonalProjects/`). Not ours; silence later via
  `turbopack.root` if it becomes annoying.

### Phase 1 — migrations since the first slice

- **`groups` + `group_members`** (`20260603210859` + fixes `…211217`, `…214316`): enums, 15-cap
  trigger, owner-auto-membership, `SECURITY DEFINER` membership helpers, full RLS.
- **`group_invites` + `pending_invites`** (`20260604003050_create_invites`): token-link invites,
  `get_invite_preview`/`redeem_group_invite` RPCs, email normaliser, `handle_new_user()` auto-join.

Both are detailed (with the bugs their tests caught) in **NEXT STEPS** below, marked DONE.

## Committed in this slice

The previously-orphaned dep additions (`supabase` devDep, `@supabase/supabase-js`,
`@supabase/ssr`) are now committed together with the Phase 1 code above — no longer dangling.

## NEXT STEPS (in order) — start here

Steps 1–3 (confirm MCP, `profiles` migration, `@supabase/ssr` + proxy scaffold) are **DONE** — see
"Phase 1 — application code" above. Step 1 below (`groups` + `group_members`) is also **DONE**
(migrations `20260603210859_create_groups_and_members` + `20260603211217_fix_membership_helper_grants`;
enums, 15-cap trigger, owner-auto-membership trigger, `SECURITY DEFINER` membership helpers that
break RLS recursion, full RLS, co-member profile-read policy; verified by a transactional smoke
test; advisors clean). Continue from step 2:

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

- Visual design is deliberately deferred — don't build polished UI yet; structure first, per
  `DESIGN-PRINCIPLES.md`. Functional/unstyled-but-usable is fine for P1.
- Auth method: email+password first; Google OAuth login is optional/later (also doubles as
  calendar consent in P2). Resend prod email depends on DMARC landing.
- ~~Fix starter leftovers (`layout.tsx` metadata, `globals.css` Arial override)~~ — DONE.
- MCP write mode = convenience + prompt-injection risk on the dev DB. No real user data yet, so
  acceptable; revisit before production.

## Persistent memory

A user-level memory note (`overlapp-project`) already mirrors this state and loads automatically
in new sessions. This file is the in-repo, more detailed version.
