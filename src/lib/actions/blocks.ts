"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics/server";
import { EVENTS } from "@/lib/analytics/events";

export type ActionState = { error: string } | undefined;

// Manual availability blocks. starts_at/ends_at arrive as UTC ISO strings —
// the client editor converts the user's local datetime-local inputs to UTC
// before submitting (all timestamps stored UTC, DATA-MODEL §0).
export async function addBlock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const rrule = String(formData.get("rrule") ?? "").trim();

  if (!startsAt || !endsAt) return { error: "Start and end times are required." };
  if (new Date(endsAt) <= new Date(startsAt)) {
    return { error: "End time must be after the start time." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("manual_blocks").insert({
    user_id: user.id,
    starts_at: startsAt,
    ends_at: endsAt,
    label: label || null,
    rrule: rrule || null,
  });

  if (error) return { error: error.message };
  await track(EVENTS.BLOCK_ADDED, user.id, { recurring: Boolean(rrule) });
  revalidatePath("/availability");
  return undefined;
}

export async function deleteBlock(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("block_id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("manual_blocks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/availability");
}
