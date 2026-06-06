"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

import { posthogConfigured } from "@/lib/analytics/config";

// Ties the browser's PostHog session to the signed-in user, so client pageviews
// and the server-emitted domain events (which key off the Supabase user id) roll
// up to one person. Mounted in the authenticated (app) layout, which already has
// the profile in hand. We pass ONLY the id — no name/email — to keep PostHog
// free of PII (matching the product's free/busy-only privacy line).
export function AnalyticsIdentify({ userId }: { userId: string }) {
  useEffect(() => {
    if (!posthogConfigured() || !userId) return;
    posthog.identify(userId);
  }, [userId]);

  return null;
}
