# Overlapp — Testing Strategy

> Created 2026-06-03. This is the durable source of truth for how we test Overlapp.
> Read it before adding tests or running an end-of-phase verification pass.

## Philosophy

**Test what exists, at the end of every phase.** Overlapp is built phase by phase
(see `CLAUDE.md` roadmap). At the close of each phase we run the full verification ritual
(below) against whatever that phase actually shipped — no more, no less. We do **not** write
tests for unbuilt features, and we do **not** skip testing because "it's obviously fine."

The goal is to never work off bad assumptions. Two real schema bugs were already caught this
way on day one (see _Findings_ below) — both invisible to a casual read of the SQL.

Going forward, **testing leads feature work**: when a phase adds UI, the feature/e2e layer grows
to drive that UI as real users and screenshot it.

## The three layers

| Layer | Tool | What it covers | Needs |
|---|---|---|---|
| **Unit** | Vitest | Pure logic — no I/O (env parsing, date/timezone math, RRULE expansion, initials, formatting). | nothing |
| **Integration / feature** | Vitest + **local Supabase** | The real `@supabase/supabase-js` → PostgREST → **RLS/triggers** path, acting as actual signed-in users. This is where data-layer correctness lives. | Docker + local stack |
| **E2E + visual** | Playwright _(added when UI exists)_ | Drive the running app as test user(s) through real flows; screenshot each screen, review for visual correctness, then **delete the screenshots**. | local stack + app |

> **Why integration tests act as real users.** We create real auth accounts (which fires the
> `handle_new_user` trigger), sign in, and make every call under that user's JWT. So RLS and
> triggers are exercised exactly as the app will hit them — not via schema introspection. A bug
> that only appears through the client path (like the `insert().select()` one) is caught here.

## Local Supabase (the integration/e2e backend)

Integration and (future) e2e tests run against a **local** Supabase stack via Docker — never the
hosted dev/prod project. The stack is isolated and resettable; migrations in
`supabase/migrations/` are applied to it with `db reset`.

```bash
# One-time / per-session (Docker Desktop must be running):
npm run db:start      # supabase start — boots Postgres, GoTrue, PostgREST, etc.
npm run db:reset      # drops + recreates the DB and replays ALL migrations (clean slate)

npm run db:stop       # tear the stack down when done (frees Docker resources)
```

Connection details (URL + anon/service keys) are **not hardcoded** — the integration global
setup shells out to `supabase status -o json` and injects them into the tests. If the stack
isn't up, the suite fails fast with a clear hint instead of hanging.

After **every migration**: `npm run db:reset` locally, regenerate
`src/lib/supabase/database.types.ts`, then re-run the suite.

## Running tests

```bash
npm run test            # everything (unit + integration). Integration needs the stack up.
npm run test:unit       # fast, no Docker needed
npm run test:integration
npm run test:watch      # watch mode
```

CI/quick checks that must always pass before a commit: `npm run test:unit`, `npx tsc --noEmit`,
`npx eslint .`, `npx next build`. The integration suite additionally requires the local stack.

## Conventions

- **Layout.** `tests/unit/**` and `tests/integration/**`. Integration helpers live in
  `tests/integration/_helpers.ts`; the stack-connection bootstrap is
  `tests/integration/global-setup.ts`.
- **Test accounts** use the `@overlapp.test` email domain so cleanup can find them
  unambiguously. Helpers: `createUser()` (account only), `newUserClient()` (account + a
  client signed in as them), `serviceClient()` (RLS-bypassing, for setup/assertions/cleanup).
- **Isolation.** Each integration file's `beforeEach` calls `resetData()` (delete all groups →
  delete all test users). Integration tests run **strictly serially** (one fork,
  `fileParallelism: false`) because they share one database — do not parallelize them.
- **RLS assertions.** A denied _read_ returns an empty result with `error === null` (RLS filters
  rows); a denied _write_ returns an error (often code `42501`). Assert accordingly.
- **Local GoTrue is flaky under load** — only sign in accounts you actually drive, and
  `newUserClient` retries the sign-in a few times to absorb transient "Database error granting
  user" responses.

## Screenshots (visual review)

When the e2e layer exists, each verification pass captures screenshots of every screen/flow,
the screenshots are **examined for visual correctness**, and then **deleted** — they are never
committed and never kept past the review. `/screenshots` and `**/__screenshots__` are gitignored
as a backstop.

## End-of-phase verification ritual

At the close of each phase:

1. `npm run db:reset` (clean DB, all migrations applied) and regenerate DB types.
2. `npm run test` — unit + integration all green.
3. `npx tsc --noEmit`, `npx eslint .`, `npx next build` — all green.
4. Run `get_advisors` (security) on the remote project after any DDL; clear anything we
   introduced.
5. **(once UI exists)** Drive the new flows in the running app as test user(s) via Playwright;
   screenshot every screen; review each for visual correctness; fix issues; **delete the
   screenshots**.
6. Update `docs/HANDOFF.md` with what was verified.

## Current coverage (Phase 1 complete, as of 2026-06-04)

- **Unit** (`npm run test:unit`): `config.test.ts` (env validation), `format.test.ts`
  (initials / display-name / avatar colour), `rrule.test.ts` (RRULE build/describe/parse
  round-trips). **16 tests.**
- **Integration** (local stack): `profiles.test.ts` (signup trigger + profile RLS),
  `groups.test.ts` (owner auto-membership, 15-member cap, RLS, owner-protection, soft-delete
  read filter), `invites.test.ts` (token-link + pending-invite flows; now also pins
  pending-member visibility), `availability.test.ts` (manual_blocks owner-only RLS, RRULE
  expansion via `my_busy_intervals`, de-identified `group_busy_intervals`, `group_heatmap`
  everyone-free / counts / window-cap / member-gating), `group-management.test.ts`
  (`dissolve_group`, `transfer_group_ownership`, role-integrity guard). **41 tests.**
- **E2E + visual** (`npm run test:e2e`): `tests/e2e/core-loop.spec.ts` drives the full P1 loop
  as a real user against the LOCAL stack — landing → signup → onboarding → dashboard → create
  group → set availability → heatmap reflects it → public invite preview — screenshotting every
  screen to `./screenshots` (gitignored), then the screenshots are reviewed and deleted.
  Playwright boots `next dev` with env pointed at the local Supabase stack (overriding
  `.env.local`, which targets hosted). Mobile viewport (Pixel 7) — Overlapp is mobile-first.

## Findings (bugs caught by these tests)

- **`groups` insert via `.select()` rejected (42501).** `insert(...).select()` does
  `INSERT … RETURNING`, which evaluates the SELECT policy on the new row in the same statement;
  the `STABLE is_group_member()` couldn't see the owner-membership row written by the
  AFTER-INSERT trigger in that same statement. Fixed by also admitting a group to its owner
  directly in the SELECT policy (migration `…_fix_group_select_for_creator`).
- **Membership helpers lost `EXECUTE` for `authenticated`.** Revoking from `public` stripped the
  inherited grant, which would have broken every group/profile read. Fixed by an explicit grant
  (migration `…_fix_membership_helper_grants`).
- **Soft-delete has no direct-UPDATE write path.** PostgreSQL requires an UPDATE's resulting row
  to still satisfy the SELECT policy; since the policy filters `deleted_at is null`, an admin
  setting `deleted_at` would update the row out of their own visibility, so Postgres rejects it
  (42501). **RESOLVED:** group dissolution now goes through the `dissolve_group(uuid)` SECURITY
  DEFINER RPC (migration `…_create_group_management_rpcs`); `group-management.test.ts` covers it.
- **Pending members were invisible to themselves.** `is_group_member()` requires `status =
  'active'`, so a member awaiting approval couldn't read their own membership or the group, and
  the post-redeem redirect 404'd. Fixed by migration `…_pending_member_visibility` (a self-row
  SELECT policy + an any-status `has_group_membership()` group SELECT policy); availability RPCs
  still gate on active membership, so a pending user sees the group but no member availability.
