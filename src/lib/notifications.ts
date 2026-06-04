import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push";
import type { Database } from "@/lib/supabase/database.types";

// In-app notifications (spec §7). Rows are written with the service role because
// a member must be able to notify OTHER members — which the self-only RLS insert
// policy forbids. Delivery is the row the recipient reads in the app; Phase 4
// adds Web Push as a second channel (sendPushToUsers), fired from the same call
// so the two never drift. Best-effort throughout: a notification (in-app or
// push) failure never blocks the action that triggered it.

/** Where a notification kind should deep-link when its push is tapped. */
function pushUrl(input: NotifyInput): string {
  if (input.groupId && input.proposalId) {
    return `/groups/${input.groupId}/proposals/${input.proposalId}`;
  }
  if (input.groupId) return `/groups/${input.groupId}`;
  return "/notifications";
}

type NotificationKind =
  | "proposal_created"
  | "proposal_locked"
  | "proposal_cancelled"
  | "proposal_nudge";

type NotifyInput = {
  userIds: string[];
  kind: NotificationKind;
  title: string;
  body?: string | null;
  groupId?: string | null;
  proposalId?: string | null;
};

export async function notifyUsers(input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter(Boolean);
  if (recipients.length === 0) return;

  const rows: Database["public"]["Tables"]["notifications"]["Insert"][] =
    recipients.map((userId) => ({
      user_id: userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      group_id: input.groupId ?? null,
      proposal_id: input.proposalId ?? null,
    }));

  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert(rows);
  } catch {
    // Swallow — notifications are non-critical and must not fail the caller.
  }

  // Fan out Web Push as a second channel (Phase 4). Independent of the in-app
  // write above: a push failure (or no VAPID config) leaves the inbox intact.
  try {
    await sendPushToUsers(recipients, {
      title: input.title,
      body: input.body,
      url: pushUrl(input),
      tag: input.proposalId ?? input.groupId ?? input.kind,
    });
  } catch {
    // Swallow — push is best-effort.
  }
}
