"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Browser-side Supabase client for Client Components. Safe to call on every
// render — @supabase/ssr returns a singleton per browser context.
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
