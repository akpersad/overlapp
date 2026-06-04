import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

// Data Access Layer (Next.js auth guide §DAL). Every server-side data fetch and
// Server Action goes through these so the auth check is never forgotten. RLS is
// the real boundary; these add the redirect/UX layer and memoize per render.

export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Require a signed-in user or redirect to login (optionally preserving target). */
export async function requireUser(redirectTo?: string): Promise<User> {
  const user = await getUser();
  if (!user) {
    redirect(
      redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login",
    );
  }
  return user;
}

export const getProfile = cache(async (): Promise<Tables<"profiles"> | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});

/** Require a signed-in user AND their profile row (created by the signup trigger). */
export async function requireProfile(): Promise<Tables<"profiles">> {
  await requireUser();
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}
