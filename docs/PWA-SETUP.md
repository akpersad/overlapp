# PWA & Web Push setup (Phase 4)

Overlapp is an installable PWA with Web Push. This doc covers the one piece that
needs configuration — the VAPID keys for push — plus how the pieces fit.

## What ships in the box (no config needed)

- **Installable** — `src/app/manifest.ts` serves `/manifest.webmanifest`; icons
  live in `public/icons/` (regenerate with `node scripts/generate-icons.mjs`).
  The root layout sets `theme-color`, `apple-touch-icon`, and `appleWebApp`.
- **Service worker** — `public/sw.js`, registered by `src/components/ServiceWorker.tsx`
  **in production builds only** (it would fight Turbopack HMR in dev). It caches
  the app shell + visited pages (navigation network-first → cache → `/offline`)
  and handles `push` / `notificationclick`.
- **Offline group calendar** — the heatmap caches each loaded week in
  `localStorage`; when the network is unreachable it renders the last saved week
  with an "Offline — showing the last saved availability" banner.
- **Recurring hangouts** — no config; group admins define them on the group page.

## Web Push — VAPID keys (required for push only)

Push works only when VAPID keys are set. **Without them push is silently
disabled** — the in-app notification inbox is unaffected, and the push UI shows a
"not configured" / "install to enable" message.

1. Generate a keypair (one-time):
   ```bash
   node -e "console.log(require('web-push').generateVAPIDKeys())"
   ```
2. Add to `.env.local` (and your Vercel env):
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey>   # exposed to the browser to subscribe
   VAPID_PRIVATE_KEY=<privateKey>             # signs pushes server-side; never bundled
   VAPID_SUBJECT=mailto:you@example.com       # spec-required contact URL
   ```
3. Restart `next dev` (env changes need a restart).

`SUPABASE_SERVICE_ROLE_KEY` must also be present — the sender reads every user's
subscriptions via the service role (`src/lib/push.ts`).

## How push is delivered

`notifyUsers` (`src/lib/notifications.ts`) is the single fan-out point. It writes
the in-app `notifications` rows **and** calls `sendPushToUsers`, so every
proposal/lock/cancel/nudge that already produced an inbox row now also pushes —
the two channels never drift. Push is best-effort: a missing config or a dead
endpoint (404/410, auto-pruned) never fails the triggering action.

## Testing notes

- The SW + push need a **production build** (`npm run build && npm start`) and a
  **secure context** (https, or `localhost`). iOS only allows push for an
  **installed** PWA (Add to Home Screen) — the onboarding prompt reflects this.
- The Playwright e2e suite runs against `next dev`, where the SW does not
  register — so it's unaffected. Run e2e with Google env unset (see
  `docs/TESTING.md`).
- RLS + the `upcoming_hangouts` RPC are covered by `tests/integration/{push,hangouts}.test.ts`.
