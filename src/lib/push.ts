import "server-only";

import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";

// Web Push delivery (Phase 4). Layered on top of the in-app notifications
// (Phase 3): notifyUsers writes the inbox rows AND calls sendPushToUsers, so a
// push is just an extra channel — never the source of truth. Best-effort
// throughout: a missing config or a dead endpoint must never fail the action
// that triggered the notification.
//
// VAPID keys come from the env (see .env.example). If they're absent, push is
// silently disabled — the app and in-app notifications are unaffected.

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@overlapp.app";
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/** Is Web Push usable on this server (VAPID keys present)? */
export function isPushConfigured(): boolean {
  return ensureConfigured();
}

export type PushPayload = {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string | null;
};

// Send a push to every device of every listed user. Reads subscriptions with
// the service role (RLS would otherwise scope to the caller). Prunes endpoints
// the push service reports as gone (404/410) so dead devices don't accumulate.
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;
  const recipients = [...new Set(userIds)].filter(Boolean);
  if (recipients.length === 0) return;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return; // no service-role key → push disabled
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", recipients);
  if (!subs || subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/notifications",
    tag: payload.tag ?? undefined,
  });

  const dead: string[] = [];
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
        );
        // Touch last_used_at so the UI can show device freshness.
        await admin
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id);
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        // Other errors (network, 5xx) are transient — leave the row.
      }
    }),
  );

  if (dead.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", dead);
  }
}
