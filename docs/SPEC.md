# Overlapp — Product Spec

> Status: Draft v2 · Last updated 2026-06-03
> All product decisions are settled. The **data model is finalized** — see
> [`DATA-MODEL.md`](DATA-MODEL.md). Next step is building **Phase 1**.

## The problem

Scheduling with a friend group dies in a loop of "I'll check my calendar." Person 1, 2,
and 4 are free; person 3 isn't. Person 3 proposes another day; now person 1 can't make it.
Repeat forever. The information needed to answer "when can we all meet?" exists, but it's
scattered across everyone's heads and calendars and never gets collected in one place at
the same time.

## The insight

Tools like When2Meet and Doodle treat every hangout as a **one-off poll that starts from
zero** — ask the question, everyone re-enters availability, throw it away. That just makes
the loop slightly faster.

Overlapp makes availability **persistent**. A group has a shared, always-up-to-date view of
when its members are free. The answer to "when can we meet?" is computed *before* anyone
asks. Scheduling becomes "tap the green slot," not "start a poll and wait."

## North star

**The shared group calendar.** Each group has a continuously-maintained aggregate of its
members' availability. This is the core artifact everything else serves. Success = a group
can look at Overlapp and instantly see when everyone (or a quorum) is free, without a single
"let me check" message.

---

## Core concepts

### Availability is a *layer*, not raw calendar events

A calendar event is not the same as being unavailable. "Gym 6–7pm" might be movable for
friends; "Flight to NYC" is not. So availability is modeled as a derived layer on top of raw
inputs:

- **Synced events** — imported from Google/Apple/Outlook. *Busy by default.*
- **Overrides** — the owner can flip any event (or whole category) to "this doesn't block
  me," or mark free time as blocked.
- **Manual blocks** — carve out unavailable time without a real event ("never Sunday
  mornings").

```
Net availability (per person) =
    synced events
      − per-event / per-category overrides
      + manual blocks
```

This per-person layer is then **aggregated** into the group heatmap.

### Privacy

Other members see only your **free/busy state** — never event titles, details, or which
calendar a block came from. This is non-negotiable; it's what makes people comfortable
syncing a personal calendar to a friend-group app.

---

## Key decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Platform | **Mobile-first PWA** | One codebase, installable, push notifications, app-like feel on phones |
| Availability input | **Manual blocks + calendar sync** | Manual works for everyone with zero permissions; sync removes the "let me check" step |
| Event semantics | **Free/blocked overrides on synced events** | The differentiator — an event ≠ unavailability |
| Accounts | **Required** | Availability must persist and belong to a person across many groups |
| Backend | **Supabase** | Postgres + auth + realtime + storage; realtime fits the live-updating heatmap |
| Calendar order | **Google → Microsoft → Apple** | Google/MS share a clean OAuth REST pattern; Apple (CalDAV) is hardest, comes last |
| Email | **Resend (free tier) + Web Share API** | Resend for auth mail; native share sheet for invites = no infra |
| Join control | **Configurable per group** | Open-via-link by default; "approval required" toggle for groups that want it |
| Roles | **Multiple admins** | Owner can promote members to admin; supports co-organized groups |
| Group size | **Cap at 15 (for now)** | Heatmap readability degrades past ~15; revisit later |
| Slot granularity | **30 min default, group-settable** | Casual groups can go coarser; consistent grid per group |
| Quorum default | **Everyone available** | "Good enough" quorum relaxation lands in Phase 3 |

---

## Architecture (conceptual)

```
User ──┬── connects calendars (Google / Apple / Outlook)
       ├── adds manual blocks
       └── sets per-event / per-category overrides (free vs. blocked)
                        │
                        ▼
            Personal availability layer   ← details private, only free/busy shared
                        │
        belongs to many │
                        ▼
   Group  ──►  Shared group calendar (aggregated heatmap)
                        │
                        ├── "everyone free" slots highlighted
                        ├── "quorum" slots (e.g. 4 of 5)
                        └── tap a slot → propose / lock an event → notify members
```

### Stack

- **Frontend**: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- **Backend**: Supabase — Postgres, Auth, Realtime, Row-Level Security
- **PWA**: service worker + web app manifest; push via the Web Push API
- **Calendar sync**: **Google Calendar API (OAuth) → Microsoft Graph (Outlook) → Apple**.
  - Google and Microsoft are architectural twins (clean OAuth REST APIs) — build one, the
    other is largely a re-skin. Apple has **no public REST Calendar API**; iCloud goes through
    **CalDAV** (app-specific passwords, no real OAuth), so it's the hardest of the three and
    comes last. Many iPhone users already sync Google/Outlook into Apple Calendar anyway.
  - **Stopgap for iCloud-only users:** **ICS subscription links** before full CalDAV.
- **Email**: **Resend** (free tier: 3k/mo, 100/day) as the SMTP provider for Supabase Auth
  transactional mail (verification, password reset). Invites primarily use the **Web Share
  API** (native share sheet) — no email infra needed; app-sent email invites are a later add-on.

---

## Roadmap

### Phase 1 — Foundation (the core loop)
*Goal: solve the original problem with zero calendar integration.*
- Auth (required accounts) via Supabase
- Create a group; invite members (link or email)
- Manual availability blocks
- Aggregated group heatmap — "everyone free" highlighted
- **Fully testable on its own. Build this end-to-end first.**

### Phase 2 — Calendar sync
- Google Calendar OAuth + import (busy by default)
- Free/blocked override system (per-event and per-category)
- Background re-sync to keep availability fresh

### Phase 3 — Scheduling actions (multi-date proposals)
- Proposer creates an event proposal and seeds **multiple candidate date/times**.
- Members aren't locked to those — they mark **their own availability for the event**
  (pre-filled from their general availability, so it's low effort).
- Overlapp computes the **overlapping slots** across responders.
- The **proposer picks the final slot** from the overlap set → it becomes the locked event.
- Notifications + nudges (auto-remind non-responders — the real bottleneck).
- "Good enough" quorum slots (e.g. 4 of 5 can make it).
- Locked event optionally **writes back** to each member's real calendar (per their opt-in).

### Phase 4 — PWA polish
- Installable app + web app manifest
- Push notifications for proposals / reminders
- Offline view of the group calendar
- Recurring hangouts for regular groups

---

## Resolved product details

These were the open questions; all are now settled (kept here as the decision record).

- **Time zones** — slots stored in **UTC**, projected into each **viewer's local time zone**
  (auto-detected, editable). Event creation may pin a specific TZ when it matters (e.g. a flight).
- **Granularity** — **30 min default**, group-settable (casual groups can go coarser); grid is
  consistent within a group.
- **Quorum** — default = **everyone available**; "good enough" relaxation arrives in Phase 3.
- **Group size** — friend groups are >1; **capped at 15 for now** (heatmap readability degrades
  past that). Revisit + design count/percentage rendering if we lift the cap.
- **Notifications** — not aggressive; refine later.
- **Calendar write-back** — opt-in per user; pushes a locked event to their real calendar.

---

## Access & routing

- **Landing page** is the *only* public (unauthenticated) route — marketing copy, "how it
  works," and a sign-up CTA, built in Phase 1 for organic signups.
- Everything else requires a **verified account**; middleware redirects unauthenticated or
  unverified users to login/verify.
- **Sole exception:** a minimal **invite preview** ("Alex invited you to Friday Crew") shows
  group name + inviter name only — no member or availability data — to aid conversion.

---

## Invitations & email strategy

- **Primary invite = Web Share API.** Owner generates a shareable link (and/or short join
  code); tapping "Invite" opens the native share sheet (Messages, Mail, WhatsApp, …). No
  email infrastructure required.
- **App-sent email invites** are an optional later add-on via Resend's free tier.
- **Invited-but-no-account flow:** the invite link carries a group token. Recipient → invite
  preview → sign up → verify → token auto-joins them to the group. For email-address invites,
  a `pending_invites` row keyed by email auto-joins whoever signs up with that address.
- **Join control** is per-group: open-via-link by default, with an "approval required" toggle
  (admin approves pending members).
- Links can **expire / be revoked / be regenerated** by an admin.

---

## User journeys

### 1. Discovery → first session
Landing page → sign up (email+password or Google OAuth) → **verify email** → onboarding
(display name, confirm detected time zone, set/skip avatar, optionally connect a calendar,
**prompt for push notifications if PWA is installed**) → dashboard.

### 2. Group creation
Dashboard → "Create group" → name (required) + optional description/avatar → optional group
defaults (granularity, quorum, join control) → creator becomes **owner/admin** → routed to
the invite screen.

### 3. Inviting & joining
Owner shares link via native share sheet (or email). Recipient: not signed up → invite
preview → sign up → verify → auto-join; already signed in → one-tap join. Open-join or
admin-approval depending on the group setting.

### 4. Setting personal availability
Manual blocks (incl. recurring) · connect calendar (busy-by-default import) · per-event /
per-category free-blocked overrides. Availability is **global to the user** and feeds every
group they're in.

### 5. Finding a time
Open a group → always-current **aggregated heatmap** in the viewer's time zone; "everyone
free" highlighted, quorum slots secondary; week/range views.

### 6. Scheduling an event (multi-date proposal)
Proposer seeds multiple candidate slots → members mark their availability for the event
(pre-filled from general availability) → Overlapp computes overlaps → proposer picks the
final slot → locked event → optional write-back to real calendars.

### 7. Notifications
Invited to a group · slot proposed · event locked · gentle nudge if availability unset ·
reminder before a locked event. Not aggressive; refine later.

### 8. Profile & account management
Dedicated **profile page** to edit name, avatar, time zone, password; manage connected
calendars; notification prefs; delete account (transfer or dissolve owned groups).

### 9. Group management (admin)
Rename/edit group, manage members (remove, promote to admin), regenerate/revoke invite link,
set group defaults, leave/delete group.

---

## User data captured

| Field | Required? | Notes |
|---|---|---|
| Email | ✅ | Login identity; must be verified |
| Password hash *or* OAuth identity | ✅ | Supabase Auth; Google OAuth can double as calendar consent |
| First name | ✅ | Powers initials avatar + display |
| Last name | ✅ | Powers initials avatar |
| Display name | optional | Defaults to "First L." |
| Time zone | ✅ | Auto-detected, editable |
| Avatar URL | optional | **Null → render first+last initials** on a colored avatar |
| Notification prefs | defaulted | Sensible defaults, editable |
| Connected calendars | optional | Linked records, added over time |
| Created/updated timestamps | auto | |

Deliberately **not** captured at signup: phone, address, birthday — not needed for the core
loop; less PII to secure and a faster signup.

---

## Onboarding

- Prompt to **enable push notifications** — only if the PWA is installed (browsers gate the
  permission behind installation).
- *Nice-to-have (parked):* a short **"how to install the PWA on your phone" video/walkthrough**
  for iOS/Android. Not blocking; add when convenient.

---

## Data model (finalized → [`DATA-MODEL.md`](DATA-MODEL.md))

Full schema, RLS posture, and locked decisions (RRULE recurrence, Vault token storage,
soft-delete, on-the-fly heatmap) live in `DATA-MODEL.md`. Table summary:
- `users` — profile fields above.
- `groups` — name, defaults (granularity, quorum, join control), owner.
- `group_members` — membership + role (owner/admin/member) + pending-approval state.
- `pending_invites` — email-keyed invites for not-yet-registered users.
- `calendars` — connected accounts (provider, tokens, sync state).
- `events` — synced events (busy/free + override state); details stay private.
- `manual_blocks` — user-authored unavailable time (incl. recurrence).
- `proposals` + `proposal_options` + `proposal_responses` — multi-date proposal flow.
- Derived `availability` view powering the heatmap.

RLS so a member sees group free/busy aggregates but **never** another member's event details.