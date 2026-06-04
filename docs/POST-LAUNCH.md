# Overlapp — Post-Launch Backlog (non-MVP)

> Things deliberately **out of MVP scope** but worth doing after launch. Captured
> so they're not lost. Nothing here blocks shipping.
>
> **Guiding principle: stay on free tiers.** We are not paying for Vercel,
> Supabase, Resend, or any provider right now. Every item below notes the free
> path; where a feature would normally push us onto a paid plan, the free
> workaround is called out. If something *truly* needs paid infra, flag it and
> decide explicitly — don't let a default quietly cost money.

## Calendar sync — finish the provider set

- **Microsoft Graph / Outlook** — architectural twin of Google (clean OAuth REST).
  Free to use the Graph API. Re-skin of `src/lib/google/*` → `src/lib/microsoft/*`;
  the `calendar_provider` enum already has `microsoft`.
- **Apple Calendar** — no public REST API; iCloud is **CalDAV** (app-specific
  passwords). Hardest, last. Free. Enum already has `apple_caldav`.
- **ICS subscription links** — a free stopgap for iCloud-only users before full
  CalDAV: ingest a public/secret `.ics` URL on a schedule. Enum has `ics`.
- **Google push notifications (watch channels)** instead of polling — free, and
  *reduces* function invocations vs. the cron poll. Lets availability update near
  real-time without paying for more frequent crons.

## Sync freshness without paying for Vercel Pro

- Vercel **Hobby cron is once/day** (see `GOOGLE-SETUP.md`). MVP relies on that +
  on-demand sync (connect / "Sync now").
- **Free ways to sync more often:** an external scheduler (cron-job.org, GitHub
  Actions `schedule:`) hitting `/api/cron/sync-calendars` with the bearer secret,
  or the Google watch-channel push above. Only upgrade to Vercel Pro if neither
  is enough.
- **Scale guard (free):** the cron syncs calendars sequentially within a 60s
  function cap. If the user base grows, batch the work (process N per run; the
  sync is idempotent so it catches up) and add a per-calendar lock to avoid a
  cron run overlapping a manual "Sync now".

## Hardening

- **Encrypt OAuth tokens at rest** with Supabase Vault / pgsodium (free).
  Currently `calendar_secrets` is service-role-only (no Data-API grants) which
  DATA-MODEL §9-C sanctions; Vault adds encryption-at-rest on top.
- **Avatar orphan cleanup** — we upsert to a stable path so uploads don't orphan,
  but a periodic sweep of `avatars` objects with no matching profile is tidy.
- **Avatar image resizing/compression** — do it **client-side before upload**
  (canvas) to keep files small. Avoid Supabase's Image Transformation API (it's a
  paid Pro feature).

## Quality / testing

- **Mocked-fetch unit tests** for the Google HTTP layer (`exchangeCode`,
  `refreshAccessToken`, `fetchCalendarEvents` incl. pagination + the 410
  full-resync path) — the only currently-untested code paths.
- **E2E for override toggles** — seed `events` via the service role and click
  through the per-event / per-category controls (today's e2e only checks the
  "not configured" notice since Google isn't wired into the e2e env).
- **Manually verify Web Push + the service worker end-to-end** (Phase 4). These
  can't be exercised by `next dev` or the Playwright suite: the SW registers in
  **production builds only**, push needs a **secure context** (https / installed
  PWA), and iOS only permits push for an **installed** (Add to Home Screen) app.
  After deploy, against a production build with VAPID keys set (`docs/PWA-SETUP.md`):
  - **Install** the PWA on Android + iOS; confirm the manifest icons/name and that
    it launches standalone.
  - **Subscribe** via the profile "Notifications" toggle (and the onboarding prompt
    on an installed device); confirm a `push_subscriptions` row is written.
  - **Trigger** a notification (create/lock/cancel/nudge a proposal from another
    account) and confirm the push arrives + tapping it deep-links to the right page.
  - **Dead-endpoint pruning** — unsubscribe/uninstall, fire another push, confirm the
    stale row is deleted (the sender drops 404/410 endpoints).
  - **Offline calendar** — open a group online, go offline (DevTools / airplane mode),
    reload, and confirm the heatmap shows the last-saved week with the offline banner
    and `/offline` serves for never-visited pages.
  - Consider an **automated push test** later (a headless run that stubs the push
    service and asserts `sendPushToUsers` payload/pruning), but the encryption +
    browser-permission path is genuinely hard to fake — manual is the realistic MVP.

## UX follow-ups

- ~~**Account deletion: offer "transfer ownership" instead of dissolve** for owned
  groups.~~ ✅ Built in Phase 5 — per-group transfer choice on the delete flow.
- ~~**Realtime heatmap** via Supabase Realtime (free tier) — live updates instead
  of revalidate-on-action.~~ ✅ Built in Phase 5 — private per-group broadcast
  doorbell (group-id only, no event data) + silent re-fetch.
- **Visual design pass** per `DESIGN-PRINCIPLES.md` (heatmap-as-hero, one accent,
  colourblind-safe). Free — just effort. The functional UI is intentionally plain.

## Roadmap phases — all built

- **Phase 3** — multi-date proposals, nudges, quorum, calendar write-back
  (`DATA-MODEL.md §10`). ✅ Built.
- **Phase 4** — PWA: installable manifest, **Web Push** (free, VAPID keys),
  offline view, recurring hangouts (`docs/PWA-SETUP.md`). ✅ Built — see the
  end-to-end verification checklist under **Quality / testing** above.
