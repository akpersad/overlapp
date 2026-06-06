// Server-side instrumentation (Next.js 16 convention). `register()` runs once
// per server instance; `onRequestError` fires whenever the server catches an
// error during render / route / Server Action handling.
//
// We initialise Sentry for the active runtime (Node + Edge) and forward server
// errors to it. All of it is guarded by sentryConfigured() — absent DSN → no-op,
// so local dev, the test suite, and Playwright e2e run untouched.
//
// We deliberately do NOT use the Sentry bundler plugin / withSentryConfig: this
// project builds with Turbopack (the plugin targets webpack) and we don't need
// source-map upload for a free, hobby-scale setup. Runtime capture works on its
// own; stack traces just point at the built output.

import * as Sentry from "@sentry/nextjs";

import {
  ANALYTICS_ENV,
  SENTRY_DSN,
  SENTRY_TRACES_SAMPLE_RATE,
  sentryConfigured,
} from "@/lib/analytics/config";

export function register() {
  if (!sentryConfigured()) return;

  // Same init for Node and Edge runtimes; NEXT_RUNTIME distinguishes them if
  // they ever need to diverge.
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ANALYTICS_ENV,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
  });
}

export const onRequestError = Sentry.captureRequestError;
