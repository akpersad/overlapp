# Overlapp — Pre-Launch Checklist

> Things that must be **done before a public launch** (distinct from
> `POST-LAUNCH.md`, which is nice-to-have-later). Free-tier-first throughout — see
> [[free-tier-first]] / `docs/POST-LAUNCH.md`. Nothing here blocks local dev or a
> private test with Google "Test users"; these gate opening the doors to the
> public.

## Legal pages — Privacy Policy & Terms of Service  ⬅️ planned, not built yet

**Build two public, directly-linkable pages: `/privacy` and `/terms`.**

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

## Final QA before flipping public

- `npm test` (unit + integration) + `npm run test:e2e` green; `tsc`, `eslint`,
  `next build` clean.
- Run `/security-review` on the release diff.
- Manual smoke on the **production domain**: signup → verify email → create group
  → invite → connect Google Calendar → heatmap reflects real busy time → delete
  account.
- Sanity-check the legal pages render and are linked.
