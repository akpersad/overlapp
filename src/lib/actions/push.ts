"use server";

import { headers } from "next/headers";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Web Push subscription management (Phase 4). The browser creates the
// PushSubscription (endpoint + keys) and hands it here; we persist it scoped to
// the caller (RLS enforces user_id = self). One row per device endpoint —
// re-subscribing the same device upserts rather than duplicating.

type BrowserSubscription = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

export type PushActionState = { error?: string; ok?: boolean } | undefined;

export async function savePushSubscription(
  _prev: PushActionState,
  formData: FormData,
): Promise<PushActionState> {
  const user = await requireUser();

  let sub: BrowserSubscription;
  try {
    sub = JSON.parse(String(formData.get("subscription") ?? ""));
  } catch {
    return { error: "Invalid subscription." };
  }
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { error: "Incomplete subscription." };
  }

  const userAgent = (await headers()).get("user-agent") ?? null;

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: error.message };
  return { ok: true };
}

export async function removePushSubscription(
  _prev: PushActionState,
  formData: FormData,
): Promise<PushActionState> {
  await requireUser();
  const endpoint = String(formData.get("endpoint") ?? "");
  if (!endpoint) return { error: "Missing endpoint." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) return { error: error.message };
  return { ok: true };
}
