"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Recurring hangouts (Phase 4). Admin-managed group templates ("Board games,
// every Friday 7–9pm"). Stored like a manual block — an anchor occurrence
// (starts_at/ends_at, UTC) plus an iCal rrule — so the tested expander yields
// upcoming occurrences. RLS enforces admin-only writes; we re-check inputs here.

export type HangoutState = { error: string } | undefined;

export async function createRecurringHangout(
  _prev: HangoutState,
  formData: FormData,
): Promise<HangoutState> {
  const user = await requireUser();
  const groupId = String(formData.get("group_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const rrule = String(formData.get("rrule") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");

  if (!groupId) return { error: "Missing group." };
  if (!title) return { error: "Give the hangout a name." };
  if (!rrule) return { error: "Pick how often it repeats." };
  if (!startsAt || !endsAt) return { error: "Set a start and end time." };
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "It must end after it starts." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_hangouts").insert({
    group_id: groupId,
    created_by: user.id,
    title,
    description: description || null,
    rrule,
    starts_at: startsAt,
    ends_at: endsAt,
  });
  if (error) return { error: error.message };

  revalidatePath(`/groups/${groupId}`);
  return undefined;
}

export async function deleteRecurringHangout(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("hangout_id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // RLS restricts deletes to group admins.
  const { error } = await supabase
    .from("recurring_hangouts")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/groups/${groupId}`);
}
