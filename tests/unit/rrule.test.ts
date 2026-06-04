import { describe, expect, it } from "vitest";

import { buildRrule, describeRrule, parseRrule } from "@/lib/rrule";

describe("buildRrule", () => {
  it("returns null for one-off", () => {
    expect(buildRrule("none")).toBeNull();
  });
  it("builds a daily rule", () => {
    expect(buildRrule("daily")).toBe("FREQ=DAILY");
  });
  it("orders weekly BYDAY canonically (Mon→Sun)", () => {
    expect(buildRrule("weekly", ["WE", "MO"])).toBe("FREQ=WEEKLY;BYDAY=MO,WE");
  });
  it("treats weekly with no days as one-off", () => {
    expect(buildRrule("weekly", [])).toBeNull();
  });
});

describe("describeRrule", () => {
  it("describes the common cases", () => {
    expect(describeRrule(null)).toBe("One-time");
    expect(describeRrule("FREQ=DAILY")).toBe("Every day");
    expect(describeRrule("FREQ=WEEKLY;BYDAY=MO,WE")).toBe("Weekly on Mon, Wed");
  });
});

describe("parseRrule round-trips with buildRrule", () => {
  it("weekly", () => {
    const r = buildRrule("weekly", ["MO", "FR"]);
    expect(parseRrule(r)).toEqual({ repeat: "weekly", days: ["MO", "FR"] });
  });
  it("daily and none", () => {
    expect(parseRrule("FREQ=DAILY")).toEqual({ repeat: "daily", days: [] });
    expect(parseRrule(null)).toEqual({ repeat: "none", days: [] });
  });
});
