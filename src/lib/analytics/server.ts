import "server-only";

import { PostHog } from "posthog-node";
import * as Sentry from "@sentry/nextjs";

import { POSTHOG_HOST, POSTHOG_KEY, posthogConfigured } from "./config";
import type { EventName } from "./events";

// Server-side analytics. The high-signal product events come from here, not the
// browser: this app is Server-Action-heavy, so "group created" / "proposal
// locked" fire reliably server-side (no adblockers, no dropped beacons) keyed to
// the real user id. The browser only emits pageviews (instrumentation-client).
//
// Everything degrades to a no-op when PostHog isn't configured, and no call here
// ever throws into a Server Action — analytics must never break a user flow.

// Cache the client across HMR reloads in dev so we don't leak connections.
const globalForPostHog = globalThis as unknown as {
  __overlappPostHog?: PostHog;
};

function client(): PostHog | null {
  if (!posthogConfigured()) return null;
  if (!globalForPostHog.__overlappPostHog) {
    globalForPostHog.__overlappPostHog = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      // Short-lived server invocations: send each event promptly rather than
      // batching across requests. We still explicitly flush() below.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return globalForPostHog.__overlappPostHog;
}

/**
 * Record a product event for a known user. Fire-and-forget from the caller's
 * point of view, but we await the flush so the event survives the function
 * returning / redirecting (Server Actions often `redirect()` right after).
 *
 * @param event       one of the names in EVENTS (typed — no stringly typos)
 * @param distinctId  the Supabase user id, so server + client events tie to one
 *                    PostHog person
 * @param properties  low-cardinality context only — NEVER PII or event detail
 */
export async function track(
  event: EventName,
  distinctId: string,
  properties?: Record<string, string | number | boolean | null>,
): Promise<void> {
  const ph = client();
  if (!ph || !distinctId) return;
  try {
    ph.capture({ distinctId, event, properties });
    await ph.flush();
  } catch {
    // Analytics is best-effort; a delivery failure must never surface to the user.
  }
}

/**
 * Report a server-side error to Sentry. A no-op when Sentry isn't configured
 * (captureException is safe to call uninitialised). Use in catch blocks where we
 * swallow an error for UX but still want visibility.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // never let error-reporting throw
  }
}
