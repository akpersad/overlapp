"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Auth Server Actions. Supabase (@supabase/ssr) owns session cookies; these
// wrap its API and translate results into form state / redirects. Every action
// runs server-side, so credentials never touch client JS beyond the form post.

export type AuthState = { error: string } | undefined;

// State for the "fire-and-forget" email actions (reset request / resend), where
// a success isn't a redirect but an in-place confirmation message. We always
// report success on the reset request regardless of whether the address has an
// account, so the form can't be used to enumerate registered emails.
export type EmailActionState = { error: string } | { ok: true } | undefined;

function safeRedirectTo(value: FormDataEntryValue | null): string {
  // Only allow same-origin app paths as a post-auth destination.
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/dashboard";
}

/**
 * Absolute origin for links Supabase emails back to the user (password reset,
 * email confirmation). Same convention as the OAuth redirect builders
 * (`src/lib/google/oauth.ts`); set `NEXT_PUBLIC_SITE_URL` in prod — see
 * `docs/PRE-LAUNCH.md` "Swap localhost → the deployed URL".
 */
function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
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
  // No session → email confirmation is required. Carry the address through so
  // the verify page can offer a one-click "resend" without re-typing it.
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
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

/**
 * "Forgot password" — emails a recovery link. The link lands on /auth/confirm
 * (type=recovery), which establishes a short-lived recovery session and then
 * forwards to /reset-password. We never reveal whether the address has an
 * account: any non-empty email returns `ok` so the form can't enumerate users.
 */
export async function requestPasswordReset(
  _prev: EmailActionState,
  formData: FormData,
): Promise<EmailActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
  });

  return { ok: true };
}

/**
 * Sets a new password for the user in the current (recovery) session. Reached
 * from /reset-password after the recovery link has been verified, so a session
 * must already exist — an expired/invalid link leaves no session and we say so.
 */
export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "This reset link has expired. Request a new one from the sign-in page." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/dashboard");
}

/**
 * Re-sends the signup confirmation email — the escape hatch when the original
 * was missed or expired. Like the reset request, always reports `ok` (Supabase
 * also no-ops silently for an already-confirmed or unknown address).
 */
export async function resendVerification(
  _prev: EmailActionState,
  formData: FormData,
): Promise<EmailActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  await supabase.auth.resend({ type: "signup", email });

  return { ok: true };
}
