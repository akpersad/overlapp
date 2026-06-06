// Client-side instrumentation (Next.js 16 convention — runs after the document
// loads, before React hydration). Initialises the two browser-side providers,
// each guarded so an absent key is a clean no-op:
//   • PostHog — product analytics. We disable autocapture + session replay and
//     send pageviews manually, so nothing on-screen (group names, availability)
//     is ever captured. Server Actions emit the meaningful domain events.
//   • Sentry  — front-end error tracking.
//
// See docs/ANALYTICS.md for the data model and the weekly analysis workflow.

import posthog from "posthog-js";
import * as Sentry from "@sentry/nextjs";

import {
  ANALYTICS_ENV,
  POSTHOG_HOST,
  POSTHOG_KEY,
  SENTRY_DSN,
  SENTRY_TRACES_SAMPLE_RATE,
  posthogConfigured,
  sentryConfigured,
} from "@/lib/analytics/config";

if (posthogConfigured()) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // We capture pageviews ourselves in onRouterTransitionStart (+ the initial
    // one below) — App Router client navigations don't trigger a full reload.
    capture_pageview: false,
    capture_pageleave: true,
    // Privacy: no DOM scraping and no screen recording. The product promise is
    // free/busy-only; analytics holds the same line. (Replay can be enabled
    // later with masking — see docs/ANALYTICS.md.)
    autocapture: false,
    disable_session_recording: true,
    // Only create PostHog "persons" for users we explicitly identify (on login),
    // keeping anonymous noise — and our person count — down.
    person_profiles: "identified_only",
  });
  // The first load isn't a router transition, so capture it explicitly.
  posthog.capture("$pageview");
}

if (sentryConfigured()) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ANALYTICS_ENV,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    // Don't attach request bodies / cookies — avoids sending PII to Sentry.
    sendDefaultPii: false,
  });
}

// Fires when a client-side navigation begins. Feed it to both providers:
// PostHog records the pageview; Sentry stitches the navigation into traces.
export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
) {
  if (posthogConfigured()) {
    try {
      // url is a path; PostHog wants the full URL for $current_url.
      const fullUrl =
        typeof window !== "undefined" ? new URL(url, window.location.origin).href : url;
      posthog.capture("$pageview", { $current_url: fullUrl });
    } catch {
      // never let a pageview break navigation
    }
  }
  if (sentryConfigured()) {
    Sentry.captureRouterTransitionStart(url, navigationType);
  }
}
