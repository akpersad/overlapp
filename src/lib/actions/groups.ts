"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";
import type { Database } from "@/lib/supabase/database.types";

type JoinControl = Database["public"]["Enums"]["join_control"];
type MemberRole = Database["public"]["Enums"]["member_role"];

export type ActionState = { error: string } | undefined;

// Quorum form value → column value. "" / "everyone" / non-positive → null
// (= everyone, the default). Otherwise a positive member count (P3 §Quorum).
function parseQuorum(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const slotMinutes = Number(formData.get("slot_minutes") ?? 30);
  const joinPolicy = String(formData.get("join_policy") ?? "open") as JoinControl;
  const quorum = parseQuorum(formData.get("quorum"));

  if (!name) return { error: "A group name is required." };
  if (![15, 30, 60].includes(slotMinutes)) return { error: "Invalid slot size." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("groups")
    .insert({
      name,
      description: description || null,
      slot_minutes: slotMinutes,
      join_policy: joinPolicy === "approval" ? "approval" : "open",
      quorum,
      owner_id: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  await track(EVENTS.GROUP_CREATED, user.id, {
    slot_minutes: slotMinutes,
    join_policy: joinPolicy === "approval" ? "approval" : "open",
  });
  redirect(`/groups/${data.id}`);
}

// ---------------------------------------------------------------------------
// Edit / dissolve / transfer
// ---------------------------------------------------------------------------
export async function updateGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const id = String(formData.get("group_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const slotMinutes = Number(formData.get("slot_minutes") ?? 30);
  const joinPolicy = String(formData.get("join_policy") ?? "open") as JoinControl;
  const quorum = parseQuorum(formData.get("quorum"));

  if (!id) return { error: "Missing group." };
  if (!name) return { error: "A group name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("groups")
    .update({
      name,
      description: description || null,
      slot_minutes: [15, 30, 60].includes(slotMinutes) ? slotMinutes : 30,
      join_policy: joinPolicy === "approval" ? "approval" : "open",
      quorum,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/groups/${id}`);
  return undefined;
}

export async function dissolveGroup(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("group_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("dissolve_group", { p_group_id: id });
  if (error) throw new Error(error.message);
  redirect("/dashboard");
}

export async function transferOwnership(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("group_id") ?? "");
  const newOwner = String(formData.get("user_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_group_ownership", {
    p_group_id: id,
    p_new_owner: newOwner,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/groups/${id}`);
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------
export async function leaveGroup(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("group_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  redirect("/dashboard");
}

export async function removeMember(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("group_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/groups/${id}`);
}

export async function setMemberRole(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("group_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "member") as MemberRole;
  if (role !== "admin" && role !== "member") return; // owner only via transfer
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_members")
    .update({ role })
    .eq("group_id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/groups/${id}`);
}

export async function approveMember(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("group_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_members")
    .update({ status: "active" })
    .eq("group_id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/groups/${id}`);
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------
export async function createInvite(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("group_id") ?? "");
  // Opaque, hard-to-guess token for the share URL.
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_invites")
    .insert({ group_id: id, token, created_by: user.id });
  if (error) throw new Error(error.message);
  await track(EVENTS.INVITE_CREATED, user.id, { group_id: id });
  revalidatePath(`/groups/${id}`);
}

export async function revokeInvite(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("group_id") ?? "");
  const inviteId = String(formData.get("invite_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase
    .from("group_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId);
  if (error) throw new Error(error.message);
  revalidatePath(`/groups/${id}`);
}

export async function invitePendingEmail(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("group_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter an email address." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pending_invites")
    .insert({ group_id: id, email, invited_by: user.id });
  if (error) {
    if (error.code === "23505") return { error: "That email is already invited." };
    return { error: error.message };
  }
  revalidatePath(`/groups/${id}`);
  return undefined;
}

export async function redeemInvite(token: string): Promise<{ groupId: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_group_invite", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Invite is invalid or expired.");
  await track(EVENTS.INVITE_REDEEMED, user.id, { group_id: row.group_id });
  return { groupId: row.group_id };
}
