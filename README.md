# Overlapp

Group-scheduling app that kills the "I'll check my calendar" loop. **North star: a persistent
shared group calendar** — availability lives continuously, so "when can we meet?" is answered
before anyone asks (vs. When2Meet/Doodle one-off polls).

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md) — product spec (problem, decisions, journeys, roadmap). **Read first.**
- [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) — finalized Postgres/Supabase schema, RLS, build order.
- [`docs/DESIGN-PRINCIPLES.md`](docs/DESIGN-PRINCIPLES.md) — anti-AI-slop UI guardrails (visual design deferred until after P1).
- [`docs/EMAIL-SETUP.md`](docs/EMAIL-SETUP.md) — Resend + Supabase auth mail, deliverability/DMARC.
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — agent instructions & current status.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · `src/` + `@/*` alias ·
Supabase (Postgres + Auth + Realtime + RLS) · mobile-first PWA.

> ⚠️ This Next.js has breaking changes vs. common knowledge — read `node_modules/next/dist/docs/`
> before writing app code (see `AGENTS.md`).

## Getting started

1. Install deps: `npm install`
2. Copy env template and fill in your Supabase values:
   ```bash
   cp .env.example .env.local
   ```
   At minimum set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Supabase Dashboard → Project Settings → API). See `.env.example` for the full list.
3. Run the dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Status

Spec + data model finalized; Supabase project provisioned; Resend auth email wired. **Next: build
Phase 1** (auth, groups, invites, manual blocks, group heatmap) — see `CLAUDE.md` for the live
next step.
