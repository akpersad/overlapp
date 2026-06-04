"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

// Upload an avatar image to the public `avatars` bucket under the caller's own
// uid folder (storage RLS enforces that), then point profiles.avatar_url at it.
// A stable path + upsert avoids orphaned files; a ?v= cache-buster defeats CDN
// caching of the replaced object.
export async function uploadAvatar(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "That file isn’t an image." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Image must be 2 MB or smaller." };
  }

  const supabase = await createClient();
  const path = `${user.id}/avatar`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { ok: true };
}

// Clears the avatar (falls back to the initials avatar) and removes the object.
export async function removeAvatar(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.storage.from("avatars").remove([`${user.id}/avatar`]);
  await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  revalidatePath("/profile");
}

// Permanently delete the account. Owned groups are dissolved (other members lose
// access — the confirmation UI warns about this; transferring ownership first
// keeps a group alive). Implemented with the service role: dissolve owned groups
// (FK from groups.owner_id would otherwise block the user delete), then delete
// the auth user, which cascades to profiles + group_members. (SPEC §8.)
export async function deleteAccount(): Promise<void> {
  const user = await requireUser();
  const admin = createAdminClient();

  const { error: groupsError } = await admin
    .from("groups")
    .delete()
    .eq("owner_id", user.id);
  if (groupsError) throw new Error(groupsError.message);

  const { error: userError } = await admin.auth.admin.deleteUser(user.id);
  if (userError) throw new Error(userError.message);

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
