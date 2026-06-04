"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Mark all of the caller's unread notifications read. RLS scopes the update to
// their own rows.
export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("notification_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function deleteNotification(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("notification_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}
