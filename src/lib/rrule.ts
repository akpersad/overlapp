// Pure RRULE helpers for the manual-block editor (unit-tested). The editor only
// emits the constrained subset the Postgres expander
// (expand_block_occurrences) understands: one-off, daily, or weekly-by-weekday.

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_LABELS: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

export type Repeat = "none" | "daily" | "weekly";

/** Build the RRULE string the editor stores, or null for a one-off block. */
export function buildRrule(repeat: Repeat, days: Weekday[] = []): string | null {
  if (repeat === "none") return null;
  if (repeat === "daily") return "FREQ=DAILY";
  // weekly
  const ordered = WEEKDAYS.filter((d) => days.includes(d));
  if (ordered.length === 0) return null; // weekly with no days = one-off
  return `FREQ=WEEKLY;BYDAY=${ordered.join(",")}`;
}

/** Human-readable summary of a stored RRULE (for listing blocks). */
export function describeRrule(rrule: string | null | undefined): string {
  if (!rrule) return "One-time";
  const parts = Object.fromEntries(
    rrule
      .replace(/^RRULE:/i, "")
      .toUpperCase()
      .split(";")
      .map((kv) => kv.split("=") as [string, string]),
  );
  const freq = parts.FREQ;
  if (freq === "DAILY") return "Every day";
  if (freq === "WEEKLY") {
    const byday = (parts.BYDAY ?? "")
      .split(",")
      .filter((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d));
    if (byday.length === 0) return "Weekly";
    const ordered = WEEKDAYS.filter((d) => byday.includes(d));
    return `Weekly on ${ordered.map((d) => WEEKDAY_LABELS[d]).join(", ")}`;
  }
  if (freq === "MONTHLY") return "Monthly";
  return "Repeats";
}

/** Parse a stored RRULE back into editor state (best-effort, P1 subset). */
export function parseRrule(rrule: string | null | undefined): {
  repeat: Repeat;
  days: Weekday[];
} {
  if (!rrule) return { repeat: "none", days: [] };
  const parts = Object.fromEntries(
    rrule
      .replace(/^RRULE:/i, "")
      .toUpperCase()
      .split(";")
      .map((kv) => kv.split("=") as [string, string]),
  );
  if (parts.FREQ === "DAILY") return { repeat: "daily", days: [] };
  if (parts.FREQ === "WEEKLY") {
    const days = (parts.BYDAY ?? "")
      .split(",")
      .filter((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d));
    return { repeat: "weekly", days };
  }
  return { repeat: "none", days: [] };
}

export function weekdayLabel(day: Weekday): string {
  return WEEKDAY_LABELS[day];
}
