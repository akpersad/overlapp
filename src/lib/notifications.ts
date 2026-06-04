import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

// In-app notifications (spec §7). Rows are written with the service role because
// a member must be able to notify OTHER members — which the self-only RLS insert
// policy forbids. Delivery is just a row the recipient reads in the app; Web
// Push is Phase 4. Best-effort: a notification failure never blocks the action
// that triggered it.

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
}
