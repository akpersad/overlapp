# Analytics & error tracking

Two free-tier providers, chosen because an AI agent (me, in Claude Code) can pull
and analyse the data directly through their **MCP servers** — so the weekly
"how's it going, what should we fix?" loop is genuinely hands-off.

| Provider    | Covers                                   | Free tier (monthly)                  | MCP server            |
| ----------- | ---------------------------------------- | ------------------------------------ | --------------------- |
| **PostHog** | Product analytics — the activation funnel | 1M events · 5K replays · 1M flags    | `mcp.posthog.com/mcp` |
| **Sentry**  | Error / exception tracking                | 5K errors · 30-day retention         | `mcp.sentry.dev/mcp`  |

Both are **optional**: with no keys set, both are a clean no-op — local dev, the
unit/integration suite, and Playwright e2e all run untouched (same pattern as the
Google/Microsoft/VAPID integrations).

---

## What's instrumented

**Product events** (server-side, keyed to the Supabase user id — see
`src/lib/analytics/events.ts`). These are the activation funnel:

| Event                       | Fires when…                              |
| --------------------------- | ---------------------------------------- |
| `signed_up`                 | account created (`via_invite` property)  |
| `signed_in`                 | password login                           |
| `onboarding_completed`      | onboarding profile saved                 |
| `group_created`             | a group is created (`slot_minutes`, `join_policy`) |
| `invite_created`            | a share-link invite is generated         |
| `invite_redeemed`           | someone joins via an invite              |
| `block_added`               | a manual availability block is saved (`recurring`) |
| `calendar_connect_started`  | Google/Microsoft OAuth begun (`provider`) |
| `proposal_created`          | a multi-date proposal is seeded (`option_count`) |
| `proposal_locked`           | the proposer locks the final slot        |

Plus automatic **`$pageview`** (client) and **`$pageleave`** events.

**Errors:** server errors via Next's `instrumentation.ts → onRequestError`,
client errors via the `error.tsx` / `global-error.tsx` boundaries, all forwarded
to Sentry.

### Privacy

Analytics holds the same free/busy-only line as the product:

- **No PII** — we identify PostHog persons by user id only (no name/email), and
  pass `sendDefaultPii: false` to Sentry.
- **No DOM scraping / no session replay** — `autocapture` and
  `disable_session_recording` are off, so group names, event titles, and
  availability are never captured. Only the event names + low-cardinality
  properties above are sent.
- Replay *can* be enabled later with text masking if it's ever worth it — see
  `src/instrumentation-client.ts`.

---

## One-time setup

### 1. PostHog

1. Create a free project at [posthog.com](https://posthog.com) (pick US or EU
   hosting — match `NEXT_PUBLIC_POSTHOG_HOST`).
2. Settings → Project → copy the **Project API Key** (`phc_…`).
3. In `.env.local`:
   ```
   NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # or eu.i.posthog.com
   ```

### 2. Sentry

1. Create a free project at [sentry.io](https://sentry.io) (platform:
   **Next.js**).
2. Settings → Client Keys (DSN) → copy the **DSN**.
3. In `.env.local`:
   ```
   NEXT_PUBLIC_SENTRY_DSN=https://xxx@oyyy.ingest.sentry.io/zzz
   ```

> On the deployed app, set the same vars (plus `NEXT_PUBLIC_ANALYTICS_ENV=production`)
> in the host's env settings. Restart `next dev` after editing `.env.local`.

### 3. MCP servers (so I can read the data)

Already declared in `.mcp.json` (`posthog` + `sentry`). They use OAuth — no
secrets in the repo. On first use, Claude Code prompts you to approve the project
MCP servers and opens a browser to sign in to each. Until you do, they show as
disconnected — that's expected. Verify with `/mcp` or `claude mcp list`.

---

## The weekly workflow

Once the keys + MCP servers are connected, start a Claude Code session in this
repo and paste a prompt like:

> **Analyse the last 7 days of Overlapp analytics.** Pull the funnel from
> PostHog (signed_up → onboarding_completed → group_created → block_added →
> proposal_created → proposal_locked) and the top errors from Sentry. Tell me:
> where users drop off, what's trending, and the top 1–3 issues. Propose
> concrete changes (with file pointers) and, for anything low-risk, open a PR.

What I'll do with that:

1. Query **PostHog** (HogQL via its MCP) for the funnel, retention, pageviews,
   and any anomalies vs. the prior week.
2. Query **Sentry** (its MCP) for the highest-frequency / newest unresolved
   issues, with stack traces.
3. Cross-reference against the code in this repo, summarise findings, and
   propose prioritised changes — implementing the safe ones directly.

Tip: tighten the loop over time by saving a project slash command (e.g.
`.claude/commands/weekly-analytics.md`) holding that prompt, so each week is just
`/weekly-analytics`.

---

## Files

- `src/lib/analytics/config.ts` — env + `posthogConfigured()` / `sentryConfigured()` guards
- `src/lib/analytics/events.ts` — the canonical event vocabulary
- `src/lib/analytics/server.ts` — server-side `track()` + `reportError()`
- `src/instrumentation-client.ts` — browser PostHog + Sentry init, pageviews
- `src/instrumentation.ts` — server Sentry init + `onRequestError`
- `src/components/AnalyticsIdentify.tsx` — ties the browser session to the user id
