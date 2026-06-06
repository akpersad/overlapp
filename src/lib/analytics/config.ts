// Analytics + error-tracking connection values, shared by the browser
// (instrumentation-client) and server (instrumentation + the server tracker).
//
// Two providers, both free-tier and both queryable by an AI agent via their MCP
// servers (see docs/ANALYTICS.md):
//   • PostHog  — product analytics (funnels, retention, the domain events we
//                emit from Server Actions). Privacy-first: no PII captured.
//   • Sentry   — error / exception tracking, "capture issues proactively".
//
// Like the Google/Microsoft/VAPID integrations, every key here is OPTIONAL:
// absent → that provider is a silent no-op and the app is unaffected. This keeps
// local dev, the test suite, and Playwright e2e deterministic with no keys set.
//
// Browser-exposed values MUST be referenced as static `process.env.NEXT_PUBLIC_*`
// literals so Next inlines them into the client bundle — hence read here, once.

// ── PostHog (product analytics) ──────────────────────────────────────────────

// Project API key — safe in the browser (it's write-only ingestion; it can't
// read your data). PostHog → Settings → Project → "Project API Key".
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

// Ingestion host. US cloud default; set to https://eu.i.posthog.com for EU, or
// your reverse-proxy path. (PostHog → Settings → Project for your region.)
export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export function posthogConfigured(): boolean {
  return POSTHOG_KEY.length > 0;
}

// ── Sentry (error tracking) ──────────────────────────────────────────────────

// DSN — safe in the browser by design (it's a public ingestion endpoint).
// Sentry → Project → Settings → Client Keys (DSN).
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

export function sentryConfigured(): boolean {
  return SENTRY_DSN.length > 0;
}

// Fraction of transactions sampled for performance tracing. Kept low to stay
// well inside the free tier; override with NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE.
export const SENTRY_TRACES_SAMPLE_RATE = Number(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1",
);

// Distinguishes prod vs preview vs local in both dashboards. Defaults to
// NODE_ENV; set NEXT_PUBLIC_ANALYTICS_ENV (e.g. "production") on the deploy.
export const ANALYTICS_ENV =
  process.env.NEXT_PUBLIC_ANALYTICS_ENV ??
  process.env.NODE_ENV ??
  "development";
