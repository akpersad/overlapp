import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

import { localSupabase } from "./_creds";

// Shared e2e helpers. We drive the app as real users for the flows actually
// under test, and seed everything else via the service role (TESTING.md: local
// GoTrue is flaky under load, so only sign in accounts we genuinely drive).

const TEST_PASSWORD = "e2e-password-123!";
export const TEST_EMAIL_DOMAIN = "overlapp.test";

/** Service-role client — bypasses RLS. For setup, assertions, cleanup. */
export function serviceClient(): SupabaseClient {
  const { url, serviceKey } = localSupabase();
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Unique, cleanup-friendly email under the @overlapp.test domain. */
export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.floor(performance.now())}@${TEST_EMAIL_DOMAIN}`;
}

export interface SeededUser {
  id: string;
  email: string;
  password: string;
}

/**
 * Create a confirmed auth user (fires handle_new_user → profile row) WITHOUT
 * signing in — for a second participant who exists but isn't driven in a
 * browser. Mirrors the integration suite's createUser().
 */
export async function seedUser(
  svc: SupabaseClient,
  opts: { first?: string; last?: string; email?: string } = {},
): Promise<SeededUser> {
  const email = opts.email ?? uniqueEmail("seed");
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: opts.first ?? "Sam",
      last_name: opts.last ?? "Seed",
      time_zone: "UTC",
    },
  });
  if (error) throw error;
  return { id: data.user.id, email, password: TEST_PASSWORD };
}

/** Look up a profile id by email (e.g. for a UI-driven user). */
export async function profileIdByEmail(
  svc: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await svc
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Add a user to a group as an active member with the given role. */
export async function seedMembership(
  svc: SupabaseClient,
  groupId: string,
  userId: string,
  role: "owner" | "admin" | "member" = "member",
): Promise<void> {
  const { error } = await svc
    .from("group_members")
    .insert({ group_id: groupId, user_id: userId, role, status: "active" });
  if (error) throw error;
}

/** Create a group directly (service role) owned by `ownerId`; returns its id. */
export async function seedGroup(
  svc: SupabaseClient,
  ownerId: string,
  name: string,
): Promise<string> {
  const { data, error } = await svc
    .from("groups")
    .insert({ name, owner_id: ownerId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Seed a share-link invite token for a group; returns the token. */
export async function seedInvite(
  svc: SupabaseClient,
  groupId: string,
  createdBy: string,
): Promise<string> {
  const token = `e2etoken${Date.now()}${Math.floor(performance.now())}`;
  const { error } = await svc
    .from("group_invites")
    .insert({ group_id: groupId, token, created_by: createdBy });
  if (error) throw error;
  return token;
}

/**
 * Drive landing → signup → onboarding → dashboard for a brand-new account.
 * Returns the credentials. Use where auth/onboarding is genuinely exercised.
 */
export async function signUpNewUser(
  page: Page,
  opts: { first?: string; last?: string; email?: string } = {},
): Promise<SeededUser> {
  const email = opts.email ?? uniqueEmail("ui");
  await page.goto("/signup");
  await page.fill("#first_name", opts.first ?? "Ada");
  await page.fill("#last_name", opts.last ?? "Lovelace");
  await page.fill("#email", email);
  await page.fill("#password", TEST_PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: /get started/i }).click();
  await page.waitForURL("**/dashboard");
  return { id: "", email, password: TEST_PASSWORD };
}

/** Sign in an existing account via the UI; retries to absorb GoTrue flakiness. */
export async function loginViaUI(
  page: Page,
  email: string,
  password = TEST_PASSWORD,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    try {
      await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 8000 });
      if (page.url().includes("/onboarding")) {
        await page.getByRole("button", { name: /get started/i }).click();
        await page.waitForURL("**/dashboard");
      }
      return;
    } catch {
      // transient — retry
    }
  }
  throw new Error(`Could not log in ${email} after retries`);
}

/** Create a group through the UI; returns { groupId, groupUrl }. */
export async function createGroupViaUI(
  page: Page,
  name: string,
  description = "",
): Promise<{ groupId: string; groupUrl: string }> {
  await page.goto("/groups/new");
  await page.fill("#name", name);
  if (description) await page.fill("#description", description);
  await page.getByRole("button", { name: /create group/i }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]+$/);
  const groupUrl = page.url();
  const groupId = groupUrl.split("/groups/")[1];
  return { groupId, groupUrl };
}

/** Today's date as YYYY-MM-DD (local), matching the date-input format. */
export function todayISODate(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A date N days from today as YYYY-MM-DD (local). */
export function offsetISODate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return todayISODate(d);
}

/** Assert no unexpected error boundary rendered (Next dev overlay / 500). */
export async function expectNoAppError(page: Page): Promise<void> {
  await expect(
    page.getByText(/Application error|Internal Server Error/i),
  ).toHaveCount(0);
}
