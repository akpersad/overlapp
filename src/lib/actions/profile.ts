"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string; ok?: false } | { ok: true } | undefined;

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const timeZone = String(formData.get("time_zone") ?? "").trim();

  if (!firstName || !lastName) {
    return { error: "First and last name are required." };
  }
  if (!timeZone) {
    return { error: "A time zone is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      display_name: displayName || null,
      time_zone: timeZone,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/profile");
  return { ok: true };
}

// Same as updateProfile but redirects into the app — used by onboarding so the
// flow advances server-side (no client navigation effect required).
export async function finishOnboarding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await updateProfile(undefined, formData);
  if (result && "error" in result) return result;
  redirect("/dashboard");
}
