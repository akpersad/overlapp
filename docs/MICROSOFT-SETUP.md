# Microsoft (Outlook) Calendar Sync — Setup

> Phase 6. How to wire the Microsoft (Azure AD / Entra ID) OAuth app that backs
> **Connect Microsoft Calendar** on the `/calendars` page. This is the
> architectural **twin of the Google flow** (`docs/GOOGLE-SETUP.md`): a
> *calendar-access* OAuth flow, **separate from** any Microsoft *login* provider.
> The app is already authenticated by email/password; this flow only grants
> Outlook calendar access and a refresh token so the server-side sync worker can
> pull events.

## What you get

- Users connect Outlook/Microsoft 365 calendars; their events become
  **busy-by-default** availability that feeds every group heatmap.
- The same per-event and per-category **free/blocked overrides** as Google (an
  event ≠ unavailability — the product differentiator). For Microsoft, the
  per-category rules key off the event's first **Outlook category**.
- The same **background re-sync** + opt-in **write-back** as Google — both reuse
  the provider-agnostic worker in `src/lib/calendar/sync.ts`.

Privacy is unchanged: co-members only ever see *when* you're busy (de-identified
intervals), never event titles. Tokens live in `calendar_secrets`
(service-role-only; never client-readable — `DATA-MODEL.md §9-C`).

## 1. Register the app

1. [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID** → **App
   registrations** → **New registration**.
2. **Name** it (e.g. "Overlapp"). **Supported account types** — pick to match how
   broadly you want people to connect:
   - *Accounts in any organizational directory and personal Microsoft accounts* →
     set `MICROSOFT_TENANT=common` (the default; widest reach, work + personal).
   - *Single tenant* → set `MICROSOFT_TENANT` to your directory (tenant) ID.
3. **Redirect URI** — platform **Web**, value exactly (no trailing slash):
   - `http://localhost:3000/api/calendars/microsoft/callback` (local dev)
   - `https://YOUR_DOMAIN/api/calendars/microsoft/callback` (production)
   - It must match `${NEXT_PUBLIC_SITE_URL}/api/calendars/microsoft/callback`.
4. **API permissions → Add a permission → Microsoft Graph → Delegated** → add
   **`Calendars.ReadWrite`** (covers the read sync **and** write-back),
   **`User.Read`** (to read the account email for display), and **`offline_access`**
   (this is what yields a **refresh token**). `openid` + `email` come in by
   default. No admin consent is needed for these delegated scopes; each user
   consents at connect time.
5. **Certificates & secrets → New client secret** → copy the **Value**
   immediately (it's only shown once). This is `MICROSOFT_CLIENT_SECRET`.
6. From the app's **Overview**, copy the **Application (client) ID** →
   `MICROSOFT_CLIENT_ID`.

## 2. Configure env

In `.env.local` (and your hosting provider's env for prod):

```bash
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT=common                          # or your tenant ID / organizations / consumers
NEXT_PUBLIC_SITE_URL=http://localhost:3000       # must match the redirect URI host
SUPABASE_SERVICE_ROLE_KEY=...                    # the sync worker reads/writes tokens
CRON_SECRET=$(openssl rand -hex 32)              # for the background re-sync route
```

Restart `next dev` after editing. With the Microsoft vars unset, `/calendars`
simply omits the **Connect Microsoft Calendar** button (Google is independent);
with neither provider configured the page shows a "not configured" notice.

## 3. How it flows

1. **Connect** — `connectMicrosoft()` sets a CSRF `state` cookie and redirects to
   Microsoft's consent screen. The `offline_access` scope ⇒ a refresh token comes
   back.
2. **Callback** — `app/api/calendars/microsoft/callback` validates `state`,
   exchanges the code for tokens, stores them in `calendar_secrets` (service
   role), writes the `calendars` metadata row (`provider = 'microsoft'`), and runs
   a first sync.
3. **Sync** — `src/lib/calendar/sync.ts#syncCalendar` resolves the **Microsoft
   adapter** (`src/lib/microsoft/*`), refreshes the access token if expired, and
   pulls events for a rolling window (−1d … +60d) via the Graph
   **`calendarView/delta`** query (recurring series pre-expanded into instances,
   like Google's `singleEvents=true`; the `Prefer: outlook.timezone="UTC"` header
   normalizes times). It **upserts** into `events` *without* touching the user's
   `override`. Incremental pulls reuse Graph's **`@odata.deltaLink`** cursor
   (stored in `calendars.sync_cursor`, the Microsoft analog of Google's
   `syncToken`); a 410 falls back to a full windowed pull.
4. **Busy mapping** — busy-by-default: an event's `showAs` of `free` or
   `workingElsewhere` is **free**; `busy` / `tentative` / `oof` / `unknown` are
   **busy**. The first Outlook **category** becomes our `category` for
   per-category overrides.
5. **Overrides** — effective busy = per-event `override` → per-category rule →
   `provider_busy`, resolved in the availability RPCs and mirrored in the UI —
   identical to Google.

## 4. Background re-sync

Same endpoint as Google — `app/api/cron/sync-calendars` syncs **every** stale
calendar regardless of provider (the worker dispatches per `provider`). Protect
it with `CRON_SECRET`; see `docs/GOOGLE-SETUP.md §4` for the Vercel Cron wiring
and free-tier (once-a-day) caveat.

## 5. Verifying locally

OAuth requires real Microsoft credentials, so the live round-trip is a manual
check (like Google's). **Status: ⏳ not yet verified end-to-end against a live
Microsoft account** — the deterministic pieces (OAuth URL building, event
mapping, the shared worker) are unit/integration-tested; the live consent → code
exchange → sync round-trip is the remaining manual step. Repro:

1. Fill in the env above.
2. `npm run dev` and open `http://localhost:3000`. Sign up / log in → **Calendars**
   → **Connect Microsoft Calendar** → consent.
3. You should land on `/calendars?connected=1` with your events listed (Free/Busy
   badges + override dropdowns) and each group's heatmap reflecting real busy time.
4. **Write-back:** toggle **Write-back on** for the calendar, create + lock a
   proposal in a group, and confirm the event appears in the real Outlook calendar.

> **Which Supabase does `next dev` hit?** Same caveat as Google — `.env.local`
> points at the **hosted production** project, so a local connect writes real rows
> to prod. To exercise the flow against the **local** stack, override the Supabase
> vars with `npx supabase status` values (what the e2e webServer does).

> **If the callback redirects to `/calendars?error=connect_failed`:** check the
> dev-server logs (the callback logs `[microsoft-connect] failed: …`). The classic
> cause is the same missing `service_role` table grants as Google (fixed by
> migration `grant_service_role_server_tables`, guarded by
> `tests/unit/service-role-grants.test.ts`) — no Microsoft-specific DB change is
> needed; the `calendars` / `events` / `category_overrides` tables and the
> `calendar_provider` enum already accommodate `microsoft`.

The DB layer (RLS, token isolation, override resolution, heatmap aggregation) is
shared with Google and covered by `tests/integration/calendars.test.ts`; the
event mapping and OAuth URL building by `tests/unit/microsoft.test.ts`.
```
