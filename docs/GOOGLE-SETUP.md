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
2. **APIs & Services → Library →** enable the **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: configure it (External is fine for
   testing). Add the scopes `openid`, `email`, and
   `https://www.googleapis.com/auth/calendar.readonly`. While in "Testing", add
   your Google account(s) under **Test users**.
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

**Vercel Cron** — add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/sync-calendars", "schedule": "*/30 * * * *" }] }
```

Vercel automatically sends the `CRON_SECRET` as a bearer token when the env var is
set. For any other scheduler (GitHub Actions, cron-job.org, …) send the header
yourself:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  https://YOUR_DOMAIN/api/cron/sync-calendars
```

## 5. Verifying locally

OAuth requires real Google credentials, so the live round-trip is a manual check:

1. Fill in the env above (use a Google **test user** account).
2. `npm run db:start && npm run db:reset`, then point `.env.local`'s
   `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` at the **local** stack
   (`npx supabase status`), and `npm run dev`.
3. Sign up → `/calendars` → **Connect Google Calendar** → consent.
4. You should land back on `/calendars?connected=1` with your events listed and
   each group's heatmap reflecting your real busy time.

The DB layer (RLS, token isolation, override resolution, heatmap aggregation) is
covered by automated tests (`tests/integration/calendars.test.ts`); the event
mapping and OAuth URL building by `tests/unit/google.test.ts`.
