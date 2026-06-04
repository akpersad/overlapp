import { describe, expect, it } from "vitest";

import { assertEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// The env values here come from the `unit` project's `test.env` (vitest.config.ts).
describe("assertEnv", () => {
  it("returns the value when present", () => {
    expect(assertEnv("https://example.supabase.co", "NEXT_PUBLIC_X")).toBe(
      "https://example.supabase.co",
    );
  });

  it("throws naming the missing variable and the fix", () => {
    expect(() => assertEnv(undefined, "NEXT_PUBLIC_SUPABASE_URL")).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
    expect(() => assertEnv("", "NEXT_PUBLIC_SUPABASE_URL")).toThrowError(
      /Copy \.env\.example/,
    );
  });

  it("inlines configured env into the exported constants", () => {
    expect(SUPABASE_URL).toBe("http://unit.test.local");
    expect(SUPABASE_ANON_KEY).toBe("unit-test-anon-key");
  });
});
