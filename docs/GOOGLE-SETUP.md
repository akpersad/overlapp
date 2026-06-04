# Google Calendar Sync — Setup

> Phase 2. How to wire the Google OAuth client that backs **Connect Google
> Calendar** on the `/calendars` page. This is a *calendar-access* OAuth flow,
> **separate from** any Google *login* provider (which would be configured in the
> Supabase dashboard). The app is already authenticated by email/password; this
> flow only grants read-only calendar access and a refresh token so the
> server-side sync worker can pull events.

## What you get

- Users connect Google Calendar; their events become **busy-by-default**
  availability that feeds every group heatmap.
- Per-event and per-category **free/blocked overrides** (an event ≠
  unavailability — the product differentiator).
- A **background re-sync** endpoint that keeps availability fresh.

Privacy is unchanged: co-members only ever see *when* you're busy (de-identified
intervals), never event titles. Tokens live in `calendar_secrets`
(service-role-only; never client-readable — `DATA-MODEL.md §9-C`).

## 1. Create the OAuth client

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a
   project.
2. **APIs & Services → Library →** enable the **Google Calendar API** (must be on
   for the `calendar.readonly` scope to appear in the picker later).
3. **APIs & Services → OAuth consent screen** (newer console: **Google Auth
   Platform**): configure it (External is fine for testing).
   - **Data Access** (older UI: the "Scopes" step) → **Add or remove scopes** →
     add `openid`, `…/auth/userinfo.email`, `…/auth/calendar.readonly`, and
     **`…/auth/calendar.events`** (the writable scope that powers Phase 3
     **write-back** — pushing a locked proposal onto each opted-in member's real
     calendar). If a scope isn't listed, paste it into "Manually add scopes". The
     setup *wizard may skip this step* — add it here afterward. **Note:** the app
     also requests these at runtime, so a connect can work before they're
     declared, but declaring them is required before going public.
     ⚠️ **Reconnect needed for write-back:** calendars connected before Phase 3
     only granted `calendar.readonly`. Write-back will fail with
     `insufficient_scope` (the Calendars page shows a "reconnect" hint) until the
     user disconnects and reconnects to grant `calendar.events`.
   - **Audience → Test users** → add every Google account you'll test with.
     ⚠️ While the app is in "Testing", a non-listed account gets
     **`Error 403: access_denied` ("Overlapp has not completed the Google
     verification process")** — that means *add the account as a test user*, NOT
     that you need full Google verification (that's only for public launch).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs** — add exactly (no trailing slash):
     - `http://localhost:3000/api/calendars/google/callback` (local dev)
     - `https://YOUR_DOMAIN/api/calendars/google/callback` (production)
   - It must match `${NEXT_PUBLIC_SITE_URL}/api/calendars/google/callback`.
5. Copy the **Client ID** and **Client secret**.

## 2. Configure env

In `.env.local` (and your hosting provider's env for prod):

```bash
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000   # must match the redirect URI host
SUPABASE_SERVICE_ROLE_KEY=...                # the sync worker reads/writes tokens
CRON_SECRET=$(openssl rand -hex 32)          # for the background re-sync route
```

Restart `next dev` after editing. With the Google vars unset, `/calendars` shows
a "not configured" notice and the rest of the app works normally.

## 3. How it flows

1. **Connect** — `connectGoogle()` sets a CSRF `state` cookie and redirects to
   Google's consent screen (`access_type=offline&prompt=consent` ⇒ a refresh
   token comes back).
2. **Callback** — `app/api/calendars/google/callback` validates `state`,
   exchanges the code for tokens, stores them in `calendar_secrets` (service
   role), writes the `calendars` metadata row, and runs a first sync.
3. **Sync** — `src/lib/google/sync.ts#syncCalendar` refreshes the access token if
   expired, pulls `calendar.readonly` events for a rolling window (−1d … +60d)
   with `singleEvents=true`, and **upserts** into `events` *without* touching the
   user's `override` column. Incremental pulls use Google's `syncToken`
   (`calendars.sync_cursor`); a 410 falls back to a full windowed pull.
4. **Overrides** — effective busy = per-event `override` → per-category rule →
   `provider_busy`, resolved in the availability RPCs and mirrored in the UI.

## 4. Background re-sync

`app/api/cron/sync-calendars` syncs every calendar not synced in the last 30 min.
Protect it with `CRON_SECRET` and point a scheduler at it.

**Vercel Cron** — already wired in `vercel.json` (committed):

```json
{ "crons": [{ "path": "/api/cron/sync-calendars", "schedule": "0 6 * * *" }] }
```

⚠️ **Free-tier (Hobby) limit:** Vercel Hobby cron jobs can only run **once per
day** — a more frequent expression (e.g. `*/30 * * * *`) **fails deployment**.
So on the free plan the committed schedule is daily (`0 6 * * *`, fired sometime
06:00–06:59 UTC). That only affects *background* freshness: connecting a calendar
and the **Sync now** button still pull on demand any time. To re-sync more often
without paying for Vercel Pro, either upgrade, or have a free external scheduler
(e.g. cron-job.org, GitHub Actions) hit the endpoint every N minutes:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  https://YOUR_DOMAIN/api/cron/sync-calendars
```

When `CRON_SECRET` is set in the Vercel project, Vercel **automatically** sends it
as the `Authorization: Bearer …` header on its own cron invocations (the route
checks exactly that). The sync is idempotent, so a missed or duplicated run is
safe. Cron only runs on a deployed Vercel app — it does nothing locally / in
`next dev`.

## 5. Verifying locally

OAuth requires real Google credentials, so the live round-trip is a manual check.
**Status: ✅ verified end-to-end against the production Supabase project on
2026-06-04.** To repeat it:

1. Fill in the env above (use a Google account added under **Test users**).
2. `npm run dev` and open `http://localhost:3000`. Sign up / log in → **Calendars**
   → **Connect Google Calendar** → consent (click through the "unverified app"
   screen → Advanced → continue).
3. You should land on `/calendars?connected=1` with your events listed (Free/Busy
   badges + override dropdowns) and each group's heatmap reflecting real busy time.

> **Which Supabase does `next dev` hit?** It reads `.env.local`, which points at
> the **hosted production** project — so a local connect writes real rows to prod.
> Fine for an owner smoke test. To exercise the flow against the **local** stack
> instead, override `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` with
> `npx supabase status` values (this is what the e2e webServer does).

> **If the callback redirects to `/calendars?error=connect_failed`:** check the
> dev-server logs (the callback logs `[google-connect] failed: …`). The classic
> cause is missing `service_role` table grants on a hosted project with
> auto-expose OFF — fixed by migration `grant_service_role_server_tables` and
> guarded by `tests/unit/service-role-grants.test.ts`.

The DB layer (RLS, token isolation, override resolution, heatmap aggregation) is
covered by automated tests (`tests/integration/calendars.test.ts`); the event
mapping and OAuth URL building by `tests/unit/google.test.ts`.
