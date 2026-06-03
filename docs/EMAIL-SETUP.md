# Overlapp — Email Setup (Resend + Supabase)

> Status: living doc · Created 2026-06-03
> How Overlapp sends transactional auth mail, and how to keep it out of spam.

## Architecture

Supabase Auth sends all transactional mail (confirm signup, magic link, password
reset, invite) via **custom SMTP → Resend**. No email code in the app; it's all
dashboard config. Sending domain: **`payroll.persadpay.com`** (a subdomain on the
existing `persadpay.com`, DNS hosted at **GoDaddy**).

> Eventual cleanup: a dedicated `mail.overlapp.*`-style subdomain would be tidier than
> reusing the PersadPay `payroll` subdomain, but it's cosmetic — deliverability is fine.

## SMTP credentials (Supabase → Authentication → Emails → SMTP Settings)

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API key (`re_…`) |
| Sender email | an address on the verified domain, e.g. `noreply@payroll.persadpay.com` |
| Sender name | `Overlapp` |

## Deliverability — why mail landed in spam, and the fixes

First test mail landed in **spam**, then moved to Inbox after manually marking
"Not Spam" — but that only trains the *sender's own* mailbox; new recipients get no
benefit. Authentication itself is healthy: Gmail showed `mailed-by: send.payroll.persadpay.com`
(**SPF passes + aligns**) and `signed-by: payroll.persadpay.com` (**DKIM passes + aligns**).

Two durable fixes:

### Fix A — Branded HTML templates (done)
Default Supabase templates are a bare link → spam signal. Branded templates with real
copy, a button, a plaintext fallback link, and a footer live in
[`docs/email-templates/`](email-templates/):
- `confirm-signup.html` → Supabase template **"Confirm signup"**
- `magic-link.html` → **"Magic Link"**
- `reset-password.html` → **"Reset Password"**
- `invite.html` → **"Invite user"**

To install: Supabase → Authentication → Emails → **Templates** → pick the template →
paste the HTML → Save. All use the `{{ .ConfirmationURL }}` variable.

### Fix B — Add a DMARC record (GoDaddy)
SPF + DKIM passing is no longer enough; Gmail/Yahoo expect DMARC. Adding it is the most
likely single fix for the spam placement.

**First check if one already exists** (persadpay.com may already send mail):
GoDaddy → **Domain Portfolio** → `persadpay.com` → **DNS** → look in the records list for a
**TXT** record named `_dmarc`. If it exists, leave it — DMARC is in place. If not, add it:

1. GoDaddy → **My Products** → `persadpay.com` → **DNS** (or "Manage DNS").
2. **Add New Record**:
   - **Type:** `TXT`
   - **Name:** `_dmarc`  *(GoDaddy auto-appends `.persadpay.com` — don't type the full thing)*
   - **Value:** `v=DMARC1; p=none; rua=mailto:akpersad@gmail.com`
   - **TTL:** 1 hour (default)
3. **Save.** Wait ~15–60 min to propagate.

A record at `_dmarc.persadpay.com` covers the `payroll` subdomain too. `p=none` =
monitor-only (safe); it satisfies the requirement without risking legit mail.

### Fix C — Warm the domain
A new sending domain has no reputation; it improves with steady, low-volume sending.
Marking early mail "Not Spam" + adding the sender to Contacts helps locally.

## Rate limits
- Resend free tier: **100/day, 3k/month**.
- Supabase → Authentication → Rate Limits → "Rate limit for sending emails" defaults low
  (~30/hr on custom SMTP). Fine for now; know the ceiling exists before a signup burst.

## How to verify
1. Trigger a send (Supabase → Authentication → Users → invite a test user, or sign up).
2. Check it lands in **Inbox** (after DMARC + templates). First time, peek in spam.
3. **Resend → Logs** shows every send + delivery status — the source of truth for debugging.
4. Optional: open the mail → "Show original" → confirm `spf=pass dkim=pass dmarc=pass`.
