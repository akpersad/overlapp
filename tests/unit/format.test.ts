import { describe, expect, it } from "vitest";

import { avatarColor, displayName, initials } from "@/lib/format";

describe("initials", () => {
  it("takes first letter of each name, upper-cased", () => {
    expect(initials("Ada", "Lovelace")).toBe("AL");
    expect(initials("grace", "hopper")).toBe("GH");
  });
  it("handles missing parts and falls back to ?", () => {
    expect(initials("Ada", "")).toBe("A");
    expect(initials(null, null)).toBe("?");
    expect(initials("", "  ")).toBe("?");
  });
});

describe("displayName", () => {
  it("prefers an explicit display_name", () => {
    expect(
      displayName({ display_name: "Ace", first_name: "Ada", last_name: "L" }),
    ).toBe("Ace");
  });
  it('falls back to "First L."', () => {
    expect(
      displayName({ display_name: null, first_name: "Ada", last_name: "Lovelace" }),
    ).toBe("Ada L.");
  });
  it("uses first name alone when last name missing", () => {
    expect(displayName({ first_name: "Ada", last_name: "" })).toBe("Ada");
    expect(displayName({})).toBe("Member");
  });
});

describe("avatarColor", () => {
  it("is deterministic and returns an hsl string", () => {
    const a = avatarColor("user-1");
    expect(a).toBe(avatarColor("user-1"));
    expect(a).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
  });
});
