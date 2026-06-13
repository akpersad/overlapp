"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/notifications";
import { removeProposalWriteback, writeBackProposal } from "@/lib/calendar/sync";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

export type ActionState = { error: string } | undefined;

type OptionInput = { starts_at: string; ends_at: string };
type ResponseInput = { option_id: string; response: "yes" | "no" | "maybe" };

// Active members of a group except `exclude` — used to fan out notifications.
async function otherActiveMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  exclude: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("status", "active");
  return (data ?? []).map((m) => m.user_id).filter((id) => id !== exclude);
}

// ---------------------------------------------------------------------------
// Create — proposer seeds candidate slots (spec §6). Options arrive as a JSON
// array in the `options` field. Atomic via the create_proposal RPC.
// ---------------------------------------------------------------------------
export async function createProposal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const groupId = String(formData.get("group_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const pinnedTz = String(formData.get("pinned_tz") ?? "").trim();

  if (!groupId) return { error: "Missing group." };
  if (!title) return { error: "Give the event a title." };

  let options: OptionInput[];
  try {
    options = JSON.parse(String(formData.get("options") ?? "[]"));
  } catch {
    return { error: "Invalid options." };
  }
  options = options.filter((o) => o?.starts_at && o?.ends_at);
  if (options.length === 0) return { error: "Add at least one candidate time." };
  if (options.some((o) => new Date(o.ends_at) <= new Date(o.starts_at))) {
    return { error: "Each option must end after it starts." };
  }

  const supabase = await createClient();
  const { data: proposalId, error } = await supabase.rpc("create_proposal", {
    p_group_id: groupId,
    p_title: title,
    p_description: description || "",
    p_pinned_tz: pinnedTz || "",
    p_options: options,
  });
  if (error) return { error: error.message };

  const { data: group } = await supabase
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();
  await notifyUsers({
    userIds: await otherActiveMembers(supabase, groupId, user.id),
    kind: "proposal_created",
    title: `New proposal: ${title}`,
    body: group?.name ? `In ${group.name} — mark your availability.` : null,
    groupId,
    proposalId: proposalId as string,
  });

  await track(EVENTS.PROPOSAL_CREATED, user.id, {
    group_id: groupId,
    option_count: options.length,
  });

  redirect(`/groups/${groupId}/proposals/${proposalId}`);
}

// ---------------------------------------------------------------------------
// Respond — each member marks yes/no/maybe per option. Self-only via RLS.
// ---------------------------------------------------------------------------
export async function respondProposal(formData: FormData): Promise<void> {
  const user = await requireUser();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  if (!proposalId) return;

  let responses: ResponseInput[];
  try {
    responses = JSON.parse(String(formData.get("responses") ?? "[]"));
  } catch {
    return;
  }
  const valid = responses.filter(
    (r) =>
      r?.option_id &&
      (r.response === "yes" || r.response === "no" || r.response === "maybe"),
  );
  if (valid.length === 0) return;

  const supabase = await createClient();
  const { error } = await supabase.from("proposal_responses").upsert(
    valid.map((r) => ({
      proposal_id: proposalId,
      option_id: r.option_id,
      user_id: user.id,
      response: r.response,
    })),
    { onConflict: "option_id,user_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/groups/${groupId}/proposals/${proposalId}`);
}

// ---------------------------------------------------------------------------
// Lock — proposer/admin picks the final slot, then optional write-back to each
// opted-in member's real calendar (best-effort).
// ---------------------------------------------------------------------------
export async function lockProposal(formData: FormData): Promise<void> {
  const user = await requireUser();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const optionId = String(formData.get("option_id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  if (!proposalId || !optionId) return;

  const supabase = await createClient();
  const { data: didLock, error } = await supabase.rpc("lock_proposal", {
    p_proposal_id: proposalId,
    p_option_id: optionId,
  });
  if (error) throw new Error(error.message);

  // Only fan out notifications + write-back on a real open→locked transition.
  // A repeat submit (the lock form re-runs on each click) is now a no-op RPC,
  // so members no longer get a flood of duplicate "Event locked" notifications.
  if (!didLock) {
    revalidatePath(`/groups/${groupId}/proposals/${proposalId}`);
    revalidatePath(`/groups/${groupId}`);
    return;
  }

  await track(EVENTS.PROPOSAL_LOCKED, user.id, { group_id: groupId });

  const { data: proposal } = await supabase
    .from("proposals")
    .select("title, created_by")
    .eq("id", proposalId)
    .maybeSingle();

  // Notify everyone (including the proposer) that the time is set.
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("status", "active");
  await notifyUsers({
    userIds: (members ?? []).map((m) => m.user_id),
    kind: "proposal_locked",
    title: `Event locked: ${proposal?.title ?? "Proposal"}`,
    body: "The time is set. Check the details.",
    groupId,
    proposalId,
  });

  // Push to opted-in calendars. Never let a write-back error fail the lock.
  try {
    await writeBackProposal(proposalId);
  } catch {
    // best-effort
  }

  revalidatePath(`/groups/${groupId}/proposals/${proposalId}`);
  revalidatePath(`/groups/${groupId}`);
}

// ---------------------------------------------------------------------------
// Unlock — proposer/admin reverses a lock back to open (e.g. they locked the
// wrong slot, or the group needs to revisit). Removes any events we wrote back
// to members' real calendars so unlocking fully reverses the lock, then
// notifies the group. Idempotent: a no-op transition skips the fan-out.
// ---------------------------------------------------------------------------
export async function unlockProposal(formData: FormData): Promise<void> {
  const user = await requireUser();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  if (!proposalId) return;

  const supabase = await createClient();
  const { data: didUnlock, error } = await supabase.rpc("unlock_proposal", {
    p_proposal_id: proposalId,
  });
  if (error) throw new Error(error.message);
  if (!didUnlock) {
    revalidatePath(`/groups/${groupId}/proposals/${proposalId}`);
    revalidatePath(`/groups/${groupId}`);
    return;
  }

  // Pull the chosen slot back off members' calendars. Best-effort.
  try {
    await removeProposalWriteback(proposalId);
  } catch {
    // best-effort
  }

  const { data: proposal } = await supabase
    .from("proposals")
    .select("title")
    .eq("id", proposalId)
    .maybeSingle();

  await notifyUsers({
    userIds: await otherActiveMembers(supabase, groupId, user.id),
    kind: "proposal_unlocked",
    title: `Reopened: ${proposal?.title ?? "Proposal"}`,
    body: "The time is no longer set — mark your availability again.",
    groupId,
    proposalId,
  });

  revalidatePath(`/groups/${groupId}/proposals/${proposalId}`);
  revalidatePath(`/groups/${groupId}`);
}

// ---------------------------------------------------------------------------
// Cancel — proposer/admin calls off the ask.
// ---------------------------------------------------------------------------
export async function cancelProposal(formData: FormData): Promise<void> {
  const user = await requireUser();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  if (!proposalId) return;

  const supabase = await createClient();
  const { data: proposal } = await supabase
    .from("proposals")
    .select("title")
    .eq("id", proposalId)
    .maybeSingle();

  const { error } = await supabase.rpc("cancel_proposal", {
    p_proposal_id: proposalId,
  });
  if (error) throw new Error(error.message);

  await notifyUsers({
    userIds: await otherActiveMembers(supabase, groupId, user.id),
    kind: "proposal_cancelled",
    title: `Proposal cancelled: ${proposal?.title ?? ""}`.trim(),
    groupId,
    proposalId,
  });
  revalidatePath(`/groups/${groupId}/proposals/${proposalId}`);
}

// ---------------------------------------------------------------------------
// Nudge — proposer/admin reminds members who haven't responded yet (the real
// bottleneck, roadmap P3). In-app only.
// ---------------------------------------------------------------------------
export async function nudgeProposal(formData: FormData): Promise<void> {
  const user = await requireUser();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  if (!proposalId) return;

  const supabase = await createClient();

  // Only the proposer/admin may nudge — verified by reading the proposal under
  // RLS and checking management rights via the same helper the RPCs use.
  const { data: canManage } = await supabase.rpc("can_manage_proposal", {
    p_proposal_id: proposalId,
  });
  if (!canManage) return;

  const { data: proposal } = await supabase
    .from("proposals")
    .select("title")
    .eq("id", proposalId)
    .maybeSingle();

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("status", "active");
  const { data: responded } = await supabase
    .from("proposal_responses")
    .select("user_id")
    .eq("proposal_id", proposalId);

  const respondedSet = new Set((responded ?? []).map((r) => r.user_id));
  const nonResponders = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== user.id && !respondedSet.has(id));

  await notifyUsers({
    userIds: nonResponders,
    kind: "proposal_nudge",
    title: `Reminder: respond to "${proposal?.title ?? "a proposal"}"`,
    body: "Mark your availability so the group can pick a time.",
    groupId,
    proposalId,
  });
  revalidatePath(`/groups/${groupId}/proposals/${proposalId}`);
}
