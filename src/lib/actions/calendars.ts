"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, googleConfigured, OAUTH_STATE_COOKIE } from "@/lib/google/oauth";
import { syncCalendar } from "@/lib/google/sync";

// Kick off the Google calendar OAuth flow. Sets a CSRF state cookie and sends
// the user to Google's consent screen. The callback route finishes the connect.
export async function connectGoogle(): Promise<void> {
  await requireUser("/calendars");
  if (!googleConfigured()) {
    redirect("/calendars?error=not_configured");
  }

  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  redirect(buildAuthUrl(state));
}

// Disconnect a calendar. Owner-RLS delete cascades to its tokens + events.
export async function disconnectCalendar(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("calendar_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("calendars").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendars");
}

// Pull fresh events now. Ownership is enforced by reading the calendar through
// RLS first (a non-owner sees nothing), then the service-role worker syncs it.
export async function syncNow(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("calendar_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("calendars")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return; // not the caller's calendar (RLS) — no-op

  await syncCalendar(id);
  revalidatePath("/calendars");
  revalidatePath("/availability");
}

// Set or clear a single event's override. RLS scopes the update to the owner.
export async function setEventOverride(formData: FormData): Promise<void> {
  await requireUser();
  const eventId = String(formData.get("event_id") ?? "");
  const raw = String(formData.get("override") ?? "");
  const override = raw === "free" || raw === "blocked" ? raw : null;
  if (!eventId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ override })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
  revalidatePath("/calendars");
}

// Toggle write-back for a calendar (Phase 3). The owner opts in to having
// locked proposal events pushed here. Column-level grant limits the update to
// writeback_enabled; RLS scopes it to the owner.
export async function setCalendarWriteback(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("calendar_id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("calendars")
    .update({ writeback_enabled: enabled })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendars");
}

// Set or remove a per-category override.
export async function setCategoryOverride(formData: FormData): Promise<void> {
  const user = await requireUser();
  const category = String(formData.get("category") ?? "").trim();
  const raw = String(formData.get("state") ?? "");
  if (!category) return;

  const supabase = await createClient();
  if (raw === "remove") {
    const { error } = await supabase
      .from("category_overrides")
      .delete()
      .eq("user_id", user.id)
      .eq("category", category);
    if (error) throw new Error(error.message);
  } else if (raw === "free" || raw === "blocked") {
    const { error } = await supabase
      .from("category_overrides")
      .upsert(
        { user_id: user.id, category, state: raw },
        { onConflict: "user_id,category" },
      );
    if (error) throw new Error(error.message);
  }
  revalidatePath("/calendars");
}
