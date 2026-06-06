"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Auth Server Actions. Supabase (@supabase/ssr) owns session cookies; these
// wrap its API and translate results into form state / redirects. Every action
// runs server-side, so credentials never touch client JS beyond the form post.

export type AuthState = { error: string } | undefined;

function safeRedirectTo(value: FormDataEntryValue | null): string {
  // Only allow same-origin app paths as a post-auth destination.
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/dashboard";
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const timeZone = String(formData.get("time_zone") ?? "UTC").trim() || "UTC";
  const next = safeRedirectTo(formData.get("redirectTo"));

  if (!email || !password || !firstName || !lastName) {
    return { error: "All fields are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();

  // Signing up FROM a share-link invite? Record an email-keyed pending_invite
  // BEFORE creating the account so the handle_new_user() trigger auto-joins the
  // group at signup — the same robust path email invites use. This survives the
  // email-confirmation redirect (which otherwise drops the /invite/<token>
  // destination). Best-effort: a bad/expired token no-ops server-side, and the
  // user can still join by re-opening the link, so we never block signup on it.
  const inviteToken = next.match(/^\/invite\/([^/?#]+)/)?.[1];
  if (inviteToken) {
    await supabase.rpc("register_invite_signup", {
      p_token: decodeURIComponent(inviteToken),
      p_email: email,
    });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName, time_zone: timeZone },
    },
  });

  if (error) return { error: error.message };

  // Confirmations off (local/dev) → a session exists immediately → onboard.
  // Confirmations on (prod) → no session yet → tell them to verify their email.
  if (data.session) {
    redirect(next === "/dashboard" ? "/onboarding" : next);
  }
  redirect("/verify-email");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectTo(formData.get("redirectTo"));

  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
