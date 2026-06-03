# Overlapp — Session Handoff

> Created 2026-06-03. Purpose: let a fresh Claude Code session resume exactly where the
> previous one left off. Read this first, then `CLAUDE.md` → `docs/SPEC.md` → `docs/DATA-MODEL.md`.

## TL;DR — where we are

Product spec and data model are **finalized**. Backend infra (Supabase project, Resend auth
email, Supabase MCP server) is **set up**. **No application code is written yet** — the repo is
still the stock create-next-app starter. The immediate next task is **building Phase 1**, starting
with the `profiles` migration and the `@supabase/ssr` client scaffold.

## Why this handoff exists

The user is **restarting Claude Code** to load the newly-added Supabase MCP server (`.mcp.json`).
MCP servers only load at startup, and project-scoped servers require one-time approval. After
restart the user must: approve the `supabase` project server → run `/mcp` → authenticate
(browser OAuth). Once `/mcp` shows `supabase` = **connected**, the Supabase tools are available.

## Project facts

- **Path:** `/Users/apersad/Documents/Development/PersonalProjects/overlapp`
- **Stack:** Next.js 16.2.7 (App Router, Turbopack), React 19.2.4, TypeScript, Tailwind 4,
  `src/` dir, `@/*` alias. Supabase backend. Mobile-first PWA.
- **⚠️ Next.js 16 caveat:** This Next.js has breaking changes vs. training-data knowledge
  (see `AGENTS.md`). **Read `node_modules/next/dist/docs/` before writing app code** — esp.
  async `cookies()`/`headers()` and middleware patterns, which matter for `@supabase/ssr`.
- **Git:** repo at `overlapp/`, branch `feature/initial-scaffold`. No remote pushes yet.
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
  can run migrations/SQL directly). Pending: restart + OAuth (see above).
- **Supabase CLI** also installed (`npx supabase`, v2.104.0) as a devDependency — fallback/option
  for versioned migrations. Docker is available for `supabase start` (local dev) if wanted.

## UNCOMMITTED state (important!)

`package.json` / `package-lock.json` have uncommitted changes: just added deps
`supabase` (devDep), `@supabase/supabase-js`, `@supabase/ssr`. **Plan: fold these into the
first Phase 1 commit** alongside the client scaffold that uses them (don't commit them orphaned).
Run `git status` to confirm before the first build commit.

## NEXT STEPS (in order) — start here

1. **Confirm MCP is connected.** Use a Supabase MCP tool to list tables / projects. Expect an
   empty `public` schema. Sanity-check automatic-RLS is on.
2. **First migration** (`DATA-MODEL.md §12` build order): `profiles` table (1:1 with `auth.users`,
   includes `email` mirror + `deleted_at`) + `handle_new_user()` trigger (creates profile row,
   consumes `pending_invites`) + RLS policies (self read/write; co-members read basics).
   **Author the SQL as a file in `supabase/migrations/` for version control**, then apply (via MCP
   `apply_migration` or `npx supabase db push`). Generate TS types afterward.
3. **Scaffold `@supabase/ssr` client** — browser client, server client, and `middleware.ts` for
   session refresh + route gating (only landing page public; everything else gated). **Read the
   Next.js 16 docs first** (async cookies, middleware) — do NOT assume older API shapes.
4. Continue P1 build order: `groups` + `group_members` (+ 15-member-cap trigger) →
   `group_invites` & `pending_invites` (+ auto-join) → `manual_blocks` → `my_busy_intervals` /
   `group_busy_intervals` → heatmap RPC. Then auth UI, group UI, etc.

## Open decisions / reminders

- Visual design is deliberately deferred — don't build polished UI yet; structure first, per
  `DESIGN-PRINCIPLES.md`. Functional/unstyled-but-usable is fine for P1.
- Auth method: email+password first; Google OAuth login is optional/later (also doubles as
  calendar consent in P2). Resend prod email depends on DMARC landing.
- Fix the starter leftovers when touching app code: `layout.tsx` metadata still says "Create Next
  App"; `globals.css` overrides the Geist font back to Arial (`body { font-family: Arial... }`).
- MCP write mode = convenience + prompt-injection risk on the dev DB. No real user data yet, so
  acceptable; revisit before production.

## Persistent memory

A user-level memory note (`overlapp-project`) already mirrors this state and loads automatically
in new sessions. This file is the in-repo, more detailed version.
