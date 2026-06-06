# Overlapp — Pre-Launch Checklist

> Things that must be **done before a public launch** (distinct from
> `POST-LAUNCH.md`, which is nice-to-have-later). Free-tier-first throughout — see
> [[free-tier-first]] / `docs/POST-LAUNCH.md`. Nothing here blocks local dev or a
> private test with Google "Test users"; these gate opening the doors to the
> public.

## Legal pages — Privacy Policy & Terms of Service  ✅ built (Phase 5)

> Built in Phase 5: `/privacy` + `/terms` are live (route group `src/app/(legal)/`), added to the
> proxy `PUBLIC_PATHS`, and linked from the landing footer. **Remaining owner action:** confirm a
> real, monitored contact mailbox (the `CONTACT_EMAIL` placeholder in `src/app/(legal)/ui.tsx`) and
> have counsel review the copy before relying on it publicly.

**Two public, directly-linkable pages: `/privacy` and `/terms`.**

- Public routes (reachable signed-out; add `/privacy` + `/terms` to the proxy's
  `PUBLIC_PATHS`), linked from the landing-page footer.
- **Required for Google OAuth verification:** Google's consent screen needs a
  public **privacy policy URL** (and expects a **terms** URL) before the calendar
  app can leave "Testing" and accept any Google user. So this unblocks the public
  calendar feature, not just legal hygiene.
- The privacy policy must, at minimum, cover:
  - what we collect (email, name, time zone, manual blocks, and — for connected
    calendars — event times/busy-free/category/title);
  - the **free/busy-only** sharing model (co-members never see event details);
  - **Google user data**: read-only `calendar.readonly` use, and an explicit
    statement of adherence to the **Google API Services User Data Policy**
    (Limited Use); how to disconnect / revoke;
  - data retention + **account deletion** (already built — deletes profile,
    availability, calendars, memberships; dissolves owned groups);
  - a contact email.
- Keep the content reviewed by counsel before relying on it — these are
  user-facing legal commitments, not boilerplate.
- *(A scaffold for both pages was drafted and removed pending this decision; can
  be regenerated quickly when we're ready to build them.)*

## Google OAuth — going public

- Move the OAuth app from **Testing → Production** (Google Cloud → Audience).
- Provide the privacy policy + terms URLs and a verified **app domain**.
- `calendar.readonly` is a **sensitive** scope → Google verification (brand +
  scope review) is required to remove the "unverified app" screen and the 100-user
  test-user cap. Free, but can take time — start early.
- **Interim (free, zero-friction):** stay in "Testing" and add each user under
  **Test users** (cap 100). Fine for a small private launch.

## Deployment (Vercel — free Hobby tier)

- Set env vars in Vercel → Settings → Environment Variables: `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `NEXT_PUBLIC_SITE_URL` = the production origin.
- Add the **production** redirect URI to the Google OAuth client:
  `https://YOUR_DOMAIN/api/calendars/google/callback`.
- `vercel.json` cron is already committed (daily; Hobby cap). Confirm it shows
  under Project → Settings → Cron Jobs after deploy.
- Custom domain + HTTPS (Vercel provides certs free).

### Swap localhost → the deployed URL (every third-party entry point)

Everything below is currently wired to `http://localhost:3000` for local dev. Once
the deployment URL is live, add the production origin (use the final **custom
domain** if you have one — otherwise the `*.vercel.app` URL, and redo this when the
custom domain lands) in **each** place. Keep the localhost entries alongside the
production ones so local dev keeps working. No trailing slash anywhere.

1. **Vercel env → `NEXT_PUBLIC_SITE_URL`** = `https://YOUR_DOMAIN`. This single var
   drives the OAuth `redirect_uri` builders (`src/lib/google/oauth.ts`,
   `src/lib/microsoft/oauth.ts`) **and** the link-preview `metadataBase` / `og:image`
   absolute URLs (`src/app/layout.tsx`). If it's wrong, calendar connect breaks and
   shared-invite cards show broken images.
2. **Google Cloud → OAuth client** → *Authorized redirect URIs* → add
   `https://YOUR_DOMAIN/api/calendars/google/callback`; *Authorized JavaScript
   origins* → add `https://YOUR_DOMAIN`.
3. **Microsoft Entra → app registration → Authentication** → *Redirect URIs* → add
   `https://YOUR_DOMAIN/api/calendars/microsoft/callback`. (Only if Microsoft
   Calendar is enabled — see `MICROSOFT-SETUP.md`.)
4. **Supabase → Authentication → URL Configuration** (the easy one to forget — and
   the most damaging):
   - **Site URL** = `https://YOUR_DOMAIN`. Supabase builds the confirmation / reset
     / magic-link email URLs (`{{ .ConfirmationURL }}`) from this. Left at
     localhost, **every production auth email points to localhost and is unusable.**
   - **Redirect URLs** allow-list → add `https://YOUR_DOMAIN/**` so post-auth
     destinations resolve: `/auth/confirm`, the `/invite/<token>` redirect, and the
     `redirectTo` carried through signup/login.
5. **Email templates / Resend** — no URL to edit (templates use the Site URL above);
   just re-send yourself a confirmation on prod and click it end-to-end.

Smoke test after the swap: connect Google Calendar on prod, sign up a throwaway
account from an invite link and confirm the email link lands back in the app, and
paste an invite link into iMessage to confirm the preview card renders.

## Email deliverability (Resend free tier)

- Land the **DMARC** record for the sending domain (was in progress — verify it's
  green) so verification / reset emails don't spam-folder.
- Confirm Supabase Auth → SMTP points at Resend in production, and that signup
  email confirmation is **on** for prod (local has it off).

## Supabase production hardening

- Review `get_advisors` (security + performance) once more; confirm only the
  intentional items (`security_definer` WARNs, `calendar_secrets`
  RLS-no-policy INFO).
- **Enable leaked-password protection** (Supabase → Auth → Policies) — the
  standing `auth_leaked_password_protection` advisor WARN. One toggle.
- Decide on MCP write-mode against prod once real users exist (consider switching
  to read-only, or a separate project/branch). See `HANDOFF.md` open reminders.
- (Post-launch hardening, tracked separately: encrypt OAuth tokens at rest with
  Vault — `POST-LAUNCH.md`.)

## In-app functional gaps to build (code — deferred to a fresh branch)

> Identified 2026-06-06 reviewing launch readiness (the e2e expansion surfaced the
> auth-recovery edges). These are missing **application code**, distinct from the
> config/process items above. The core loop is solid + e2e-covered; these are edges.
> Build order: password reset first (the only true blocker). Each should get e2e coverage.

- **Password reset / "forgot password" — blocker.** `src/lib/auth.ts` has only
  `signUp`/`signIn`/`signOut`; a user who forgets their password is permanently
  locked out. Add: a public **`/forgot-password`** page (email field →
  `supabase.auth.resetPasswordForEmail(email, { redirectTo })`) and a
  **`/reset-password`** page that, once the recovery link lands (handled like the
  existing `src/app/auth/confirm/route.ts`, `type=recovery`), calls
  `supabase.auth.updateUser({ password })`. Add both to the proxy `PUBLIC_PATHS`;
  link "Forgot password?" from `/login`. Mirror the existing auth Server-Action +
  form-state pattern. Needs the Supabase **recovery email template** (Resend) and a
  redirect-allowlist entry. e2e can drive the request + reset pages; the emailed
  link itself is a manual check (like verify-email).

- **Branded error + not-found boundaries.** No `error.tsx` / `global-error.tsx` /
  `not-found.tsx` exist under `src/app`, so prod shows Next's unstyled default on a
  thrown server action or a bad/stale URL (revoked invite, deleted/bookmarked
  group). Add a root **`not-found.tsx`** + **`error.tsx`** (and a `global-error.tsx`
  fallback), styled with the Phase-7 tokens (reuse `AuthCard` / `src/lib/ui.ts`).

- **Resend-verification affordance.** `/verify-email` is a dead end if the email is
  missed or expires. Add a "Resend email" action
  (`supabase.auth.resend({ type: 'signup', email })`) — pass the email through from
  signup or re-enter it. Pairs with password reset as the auth-recovery set.

## Known correctness issues to resolve

- **All-day busy events block the wrong local day (timezone bug).** ✅ **FIXED
  (2026-06-05, migration `20260605211948_fix_allday_busy_timezone`).** Providers
  express all-day events as *floating calendar dates* (Google `start.date =
  "2026-06-06"`, no time/zone). Sync stores them as UTC-midnight instants
  (`2026-06-06T00:00:00Z`), which is correct as storage but ambiguous without a
  zone. The **display** was fixed earlier (`LocalTime`/`AllDayRange` render
  all-day events as dates in UTC). The **busy-interval** fix now expands each
  all-day event into the **event owner's** local calendar day using their stored
  `profiles.time_zone` (IANA — the column existed all along; the earlier note
  here that "the system doesn't store a per-user tz yet" was outdated). The fix
  lives entirely in `effective_event_busy_intervals` — `my_busy_intervals`,
  `group_busy_intervals` and `group_heatmap` all route through it, so every
  consumer is corrected with no signature/app changes. Covers both Google and
  Microsoft (same UTC-midnight mapping). Free all-day events (most
  birthdays/reminders) were never affected since they never block. Regression
  tests: `tests/integration/availability.test.ts` ("all-day events expand to the
  owner's local day"). Applied to local **and** hosted production via MCP;
  `get_advisors(security)` unchanged (no new lints — the function is SECURITY
  INVOKER).

- **Heatmap grid vs. DST transition weeks (minor, not yet fixed).** The heatmap
  client (`src/app/(app)/groups/[id]/heatmap.tsx`) builds the week grid from
  browser-local wall-clock cells (`Date#setHours`) while `group_heatmap` steps
  slots uniformly in UTC. On the two weeks/year a DST transition falls inside the
  window, a handful of local cells won't line up with a UTC slot instant and may
  render blank/misaligned. Non-DST weeks (the vast majority) are correct. Low
  priority; left as a follow-up — fix would generate the grid from the same
  uniform UTC stepping the RPC uses.

## Final QA before flipping public

- `npm test` (unit + integration) + `npm run test:e2e` green; `tsc`, `eslint`,
  `next build` clean.
- Run `/security-review` on the release diff.
- Manual smoke on the **production domain**: signup → verify email → create group
  → invite → connect Google Calendar → heatmap reflects real busy time → delete
  account.
- Sanity-check the legal pages render and are linked.
- **Run the manual-only checks** the e2e suite can't cover (live Google/Microsoft
  OAuth round-trip, Web Push delivery on an installed PWA, realtime heatmap
  delivery): see `docs/TESTING.md` → **Manual pre-launch checks**.
- **App icon + favicon** ✅ on-brand (2026-06-05): the honey×pine "overlap" mark
  (`public/icons/*` via `scripts/generate-icons.mjs`, plus `src/app/favicon.ico` +
  `public/icon.svg`); `manifest.ts` `theme_color`/`background_color` are the honey/
  cream brand. Confirm the tab favicon + installed-PWA icon look right on the
  deployed domain.
