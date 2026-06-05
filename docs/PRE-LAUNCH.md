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

## Email deliverability (Resend free tier)

- Land the **DMARC** record for the sending domain (was in progress — verify it's
  green) so verification / reset emails don't spam-folder.
- Confirm Supabase Auth → SMTP points at Resend in production, and that signup
  email confirmation is **on** for prod (local has it off).

## Supabase production hardening

- Review `get_advisors` (security + performance) once more; confirm only the
  intentional items (`security_definer` WARNs, `calendar_secrets`
  RLS-no-policy INFO).
- Decide on MCP write-mode against prod once real users exist (consider switching
  to read-only, or a separate project/branch). See `HANDOFF.md` open reminders.
- (Post-launch hardening, tracked separately: encrypt OAuth tokens at rest with
  Vault — `POST-LAUNCH.md`.)

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
