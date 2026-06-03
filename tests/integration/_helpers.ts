import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

// All test accounts use this domain so cleanup can find them unambiguously.
export const TEST_EMAIL_DOMAIN = "overlapp.test";
const TEST_PASSWORD = "test-password-123!";
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

let userCounter = 0;

function url() {
  return inject("supabaseUrl");
}

/** Service-role client — bypasses RLS. Used for setup, assertions, cleanup. */
export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(url(), inject("serviceKey"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anonymous (unauthenticated) client — subject to the `anon` role's RLS. */
export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url(), inject("anonKey"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** A client authenticated AS this user — every call runs under their RLS. */
  client: SupabaseClient<Database>;
}

interface NewUserOpts {
  firstName?: string;
  lastName?: string;
}

/**
 * Creates a confirmed auth user (which fires the handle_new_user trigger →
 * profile row). No sign-in — use for a "someone who exists but isn't acting"
 * participant. Keeping this sign-in-free matters: concurrent /token grants
 * destabilise local GoTrue, so we only sign in accounts we actually drive.
 */
export async function createUser(
  opts: NewUserOpts = {},
): Promise<Omit<TestUser, "client">> {
  const email = `user-${Date.now()}-${userCounter++}@${TEST_EMAIL_DOMAIN}`;
  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: opts.firstName ?? "Test",
      last_name: opts.lastName ?? "User",
      time_zone: "UTC",
    },
  });
  if (error) throw error;
  return { id: data.user.id, email, password: TEST_PASSWORD };
}

/**
 * Creates a user and returns a client signed in as them — every call on
 * `.client` runs under that user's RLS. This is the real signup → login path
 * the app uses, so it exercises the trigger + policies end to end.
 */
export async function newUserClient(opts: NewUserOpts = {}): Promise<TestUser> {
  const user = await createUser(opts);
  const client = anonClient();
  // Local GoTrue occasionally returns a transient "Database error granting
  // user" on the /token grant; a couple of quick retries makes sign-in robust.
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (!error) return { ...user, client };
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw lastError;
}

/** Convenience: create a group owned by `owner` and return the inserted row. */
export async function createGroup(owner: TestUser, name: string) {
  const { data, error } = await owner.client
    .from("groups")
    .insert({ name, owner_id: owner.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Hard-resets app data between tests so each starts clean. Order matters:
 * delete groups first (cascades group_members), then delete test auth users
 * (cascades profiles) — a profile that still owns a group can't be removed.
 */
export async function resetData() {
  const svc = serviceClient();
  await svc.from("groups").delete().neq("id", ZERO_UUID);

  const { data, error } = await svc.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  for (const user of data.users) {
    if (user.email?.endsWith(`@${TEST_EMAIL_DOMAIN}`)) {
      await svc.auth.admin.deleteUser(user.id);
    }
  }
}
