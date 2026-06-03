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
Spec complete; all product decisions settled. **Data model finalized** — see
[`docs/DATA-MODEL.md`](docs/DATA-MODEL.md). Design principles banked in
[`docs/DESIGN-PRINCIPLES.md`](docs/DESIGN-PRINCIPLES.md) (visual design deferred until after
P1's core loop). **Next: build Phase 1** (Supabase project + auth, groups, invites, manual
blocks, group heatmap). No app code written yet — still the stock create-next-app starter.
