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

  // Storage writes go through the service-role client: this is a trusted
  // server action (requireUser above) and the path is hard-scoped to the
  // caller's own uid folder, so we enforce ownership in code rather than rely
  // on the SSR client attaching the user JWT to the upload (it doesn't —
  // storage uploads were arriving unauthenticated and tripping the bucket's
  // owner-folder RLS). Same pattern the calendar + account-deletion paths use.
  const admin = createAdminClient();
  const path = `${user.id}/avatar`;
  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { data } = admin.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const supabase = await createClient();
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
  // Service-role for the storage delete (see uploadAvatar) — own-folder path.
  await createAdminClient().storage.from("avatars").remove([`${user.id}/avatar`]);
  const supabase = await createClient();
  await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  revalidatePath("/profile");
}

// Permanently delete the account. For each group the user owns they can choose,
// per group, to TRANSFER ownership to another active member (keeping the group
// alive) or to let it be dissolved — submitted as `transfer:<groupId>` form
// fields (value = new owner's user id, or empty = dissolve). (POST-LAUNCH UX
// follow-up; SPEC §8.)
//
// Order matters: run the transfers first (as the still-owner, via the session
// client so the RPC's auth.uid() check passes). Those groups then have a new
// owner, so the service-role delete below — which removes any groups STILL owned
// by the user (the dissolve choices) — leaves the transferred ones standing.
// Deleting the auth user then cascades to profiles + group_members.
export async function deleteAccount(formData?: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  if (formData) {
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("transfer:")) continue;
      const groupId = key.slice("transfer:".length);
      const newOwner = String(value).trim();
      if (!newOwner) continue; // empty = dissolve (handled by the delete below)
      const { error } = await supabase.rpc("transfer_group_ownership", {
        p_group_id: groupId,
        p_new_owner: newOwner,
      });
      if (error) throw new Error(error.message);
    }
  }

  const admin = createAdminClient();

  // Any groups the user still owns (dissolve choices / no eligible member) are
  // removed; the FK from groups.owner_id would otherwise block the user delete.
  const { error: groupsError } = await admin
    .from("groups")
    .delete()
    .eq("owner_id", user.id);
  if (groupsError) throw new Error(groupsError.message);

  const { error: userError } = await admin.auth.admin.deleteUser(user.id);
  if (userError) throw new Error(userError.message);

  await supabase.auth.signOut();
  redirect("/");
}
