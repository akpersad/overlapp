"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

// The group heatmap — the product's hero artifact. Renders aggregated
// availability in the VIEWER's local time zone (browser-local) via the
// on-the-fly group_heatmap RPC. Three zoom levels:
//   • Month (default) — the "are we generally free this month?" overview; each
//     day is tinted by the group's AVERAGE availability across meetable hours.
//     Click a day to drill into it.
//   • Week — seven days of 30-min (group-settable) slots; the grid where
//     proposal/quorum decisions actually happen.
//   • Day — a single day's slot column (a month drill-down).
// Intensity ramps a single deep-pine hue so it survives colourblindness
// (DESIGN-PRINCIPLES); slot cells also show the free count as text.

const DAY_START_HOUR = 7; // 7am — start of the "meetable hours" window
const DAY_END_HOUR = 23; // 11pm — end of the window
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MS_PER_DAY = 86_400_000;

type View = "month" | "week" | "day";

type Slot = {
  slot_start: string;
  busy_count: number;
  free_count: number;
  total_members: number;
  everyone_free: boolean;
  quorum: number;
  meets_quorum: boolean;
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Monday 00:00 (local) of the week containing `d`. */
function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  return addDays(x, -dow);
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// The visible date range + day cells for a view, anchored on `anchor`. Month
// snaps to whole Mon→Sun weeks covering the calendar month (≤ 42 days, inside
// the RPC's 45-day cap). Math.round on the day count absorbs DST-shifted days.
function rangeFor(view: View, anchor: Date): { from: Date; to: Date; days: Date[] } {
  if (view === "day") {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1), days: [from] };
  }
  if (view === "week") {
    const from = mondayOf(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
    return { from, to: addDays(from, 7), days };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const from = mondayOf(first);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const to = addDays(mondayOf(lastOfMonth), 7); // exclusive end cell
  const count = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
  const days = Array.from({ length: count }, (_, i) => addDays(from, i));
  return { from, to, days };
}

export function Heatmap({
  groupId,
  slotMinutes,
}: {
  groupId: string;
  slotMinutes: number;
}) {
  const [view, setView] = useState<View>("month");
  // Anchor day as epoch ms (stable across renders, clean effect dep). Nav shifts
  // it by the view's unit; switching view keeps the anchor so you stay in place.
  const [anchorMs, setAnchorMs] = useState(() => startOfDay(new Date()).getTime());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True when we're showing a cached copy because the network was unreachable
  // (Phase 4 — offline group-calendar view).
  const [stale, setStale] = useState(false);
  // Bumped by a realtime broadcast to silently re-fetch the current view when a
  // member's availability (or the group itself) changes (Phase 5 — live heatmap).
  const [liveTick, setLiveTick] = useState(0);

  const anchor = useMemo(() => new Date(anchorMs), [anchorMs]);
  const today = useMemo(() => startOfDay(new Date()), []);

  // Month view only needs a daily average, so hourly slots are plenty and keep
  // the ≤42-day payload light; week/day use the group's true slot size.
  const fetchSlotMinutes = view === "month" ? 60 : slotMinutes;

  const { from, to, days } = useMemo(
    () => rangeFor(view, anchor),
    [view, anchor],
  );

  // Per-group, per-view, per-range cache key. The heatmap is the offline hero:
  // each successfully-loaded range is persisted so a previously-opened calendar
  // still renders without a network, with a clear "last saved" indicator.
  const cacheKey = useMemo(
    () =>
      `overlapp.heatmap.${groupId}.${view}.${fetchSlotMinutes}.${from.getTime()}`,
    [groupId, view, fetchSlotMinutes, from],
  );

  // Fetch the range's heatmap whenever the group/view/range changes. setState
  // happens only inside the async resolution (never synchronously in the effect
  // body), and the cancelled flag drops a stale response from a fast nav.
  // On a network failure we fall back to the cached copy (stale = true).
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const fallbackToCache = (errMsg: string | null) => {
      if (cancelled) return;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setSlots(JSON.parse(cached) as Slot[]);
          setStale(true);
          setError(null);
          setLoading(false);
          return;
        }
      } catch {
        /* ignore cache read errors */
      }
      setError(errMsg);
      setLoading(false);
    };

    supabase
      .rpc("group_heatmap", {
        p_group_id: groupId,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_slot_minutes: fetchSlotMinutes,
      })
      // The Supabase builder is a thenable: pass a rejection handler as the
      // second arg (it has no .catch). A hard network failure (offline) rejects;
      // a query-level failure comes back as `error`.
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            fallbackToCache(error.message);
            return;
          }
          const fresh = (data as Slot[]) ?? [];
          setSlots(fresh);
          setStale(false);
          setError(null);
          setLoading(false);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(fresh));
          } catch {
            /* storage full / unavailable — non-fatal */
          }
        },
        () => fallbackToCache("Couldn't load the latest availability."),
      );
    return () => {
      cancelled = true;
    };
  }, [groupId, from, to, fetchSlotMinutes, cacheKey, liveTick]);

  // Phase 5 — live heatmap. Subscribe to this group's PRIVATE broadcast topic;
  // an AFTER trigger rings it (group_id only — no event data) whenever any
  // member's availability or the group itself changes. We coalesce a burst (e.g.
  // a calendar sync upserting many events) into a single re-fetch via a short
  // debounce, then bump liveTick to re-run the fetch effect above silently.
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`group-availability:${groupId}`, {
      config: { private: true },
    });

    channel.on("broadcast", { event: "availability_changed" }, () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (active) setLiveTick((t) => t + 1);
      }, 400);
    });

    // Private topics are authorized via realtime.messages RLS, which needs the
    // user's access token on the realtime socket. setAuth() (no arg) picks it up
    // from the current session before we subscribe.
    void supabase.realtime.setAuth().then(() => {
      if (active) channel.subscribe();
    });

    return () => {
      active = false;
      clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [groupId]);

  function navigate(dir: -1 | 1) {
    setLoading(true);
    setAnchorMs((ms) => {
      const a = new Date(ms);
      if (view === "day") return addDays(a, dir).getTime();
      if (view === "week") return addDays(a, dir * 7).getTime();
      return new Date(a.getFullYear(), a.getMonth() + dir, 1).getTime();
    });
  }
  function resetToToday() {
    setLoading(true);
    setAnchorMs(startOfDay(new Date()).getTime());
  }
  function switchView(next: View) {
    if (next === view) return;
    setLoading(true);
    setView(next);
  }
  // A month-cell click drills into that day.
  function openDay(day: Date) {
    setLoading(true);
    setAnchorMs(startOfDay(day).getTime());
    setView("day");
  }

  // Index slots by epoch ms (RPC ISO format differs from Date#toISOString).
  const byTime = useMemo(() => {
    const m = new Map<number, Slot>();
    for (const s of slots) m.set(new Date(s.slot_start).getTime(), s);
    return m;
  }, [slots]);

  // 30-min (or group slot) rows across the meetable-hours window, for week/day.
  const rowTimes = useMemo(() => {
    const times: number[] = [];
    for (let h = DAY_START_HOUR * 60; h < DAY_END_HOUR * 60; h += slotMinutes) {
      times.push(h);
    }
    return times;
  }, [slotMinutes]);

  const total = slots[0]?.total_members ?? 0;
  const quorum = slots[0]?.quorum ?? 0;

  // Whether we're viewing the period containing today (drives the reset link).
  const onCurrent =
    view === "month"
      ? anchor.getFullYear() === today.getFullYear() &&
        anchor.getMonth() === today.getMonth()
      : view === "week"
        ? mondayOf(anchor).getTime() === mondayOf(today).getTime()
        : sameDay(anchor, today);

  const label =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? `${days[0].toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })} – ${days[6].toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}`
        : anchor.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          });
  const resetLabel =
    view === "month" ? "This month" : view === "week" ? "This week" : "Today";

  return (
    <div className="flex flex-col gap-3">
      {/* View switcher */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg bg-surface-sunken p-0.5 text-sm">
          {(["month", "week", "day"] as const).map((v) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              aria-pressed={view === v}
              className={`rounded-md px-3 py-1 font-medium capitalize transition-colors ${
                view === v
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Period navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="rounded-md px-2.5 py-1 text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          ← Prev
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-ink tabular">{label}</p>
          {!onCurrent && (
            <button
              onClick={resetToToday}
              className="text-xs font-medium text-honey-700 hover:underline"
            >
              {resetLabel}
            </button>
          )}
        </div>
        <button
          onClick={() => navigate(1)}
          className="rounded-md px-2.5 py-1 text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          Next →
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {stale && (
        <p className="rounded-md bg-honey-50 px-2.5 py-1.5 text-xs font-medium text-honey-900">
          Offline — showing the last saved availability.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg bg-surface-sunken p-3">
        {view === "month" ? (
          <MonthGrid
            days={days}
            month={anchor.getMonth()}
            today={today}
            byTime={byTime}
            onPick={openDay}
          />
        ) : (
          <SlotGrid days={days} rowTimes={rowTimes} byTime={byTime} />
        )}
      </div>

      <Legend loading={loading} total={total} quorum={quorum} view={view} />
    </div>
  );
}

// ── Month view ───────────────────────────────────────────────────────────────

// Average the group's availability for one local day across the meetable-hours
// window (7a–11p). The RPC for month view returns hourly slots in UTC; we place
// each into its local hour and average free_count / total_members.
function dayAverage(
  day: Date,
  byTime: Map<number, Slot>,
): { ratio: number; avgFree: number; total: number; hasData: boolean } {
  let sumRatio = 0;
  let sumFree = 0;
  let n = 0;
  let total = 0;
  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
    const cell = new Date(day);
    cell.setHours(h, 0, 0, 0);
    const slot = byTime.get(cell.getTime());
    if (slot && slot.total_members > 0) {
      sumRatio += slot.free_count / slot.total_members;
      sumFree += slot.free_count;
      total = slot.total_members;
      n++;
    }
  }
  if (n === 0) return { ratio: 0, avgFree: 0, total: 0, hasData: false };
  return { ratio: sumRatio / n, avgFree: sumFree / n, total, hasData: true };
}

// Map a 0–1 availability ratio onto the 6-step deep-pine ramp (av-0..av-5).
function ratioBucket(ratio: number): number {
  if (ratio <= 0) return 0;
  if (ratio >= 0.8) return 5;
  if (ratio >= 0.6) return 4;
  if (ratio >= 0.4) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

function MonthGrid({
  days,
  month,
  today,
  byTime,
  onPick,
}: {
  days: Date[];
  month: number;
  today: Date;
  byTime: Map<number, Slot>;
  onPick: (d: Date) => void;
}) {
  return (
    <div className="min-w-[320px]">
      <div className="grid grid-cols-7 gap-[3px] pb-1.5">
        {WEEKDAY_LABELS.map((l) => (
          <div key={l} className="text-center text-xs font-semibold text-ink">
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {days.map((day, i) => {
          const { ratio, avgFree, total, hasData } = dayAverage(day, byTime);
          const bucket = ratioBucket(ratio);
          const inMonth = day.getMonth() === month;
          const isToday = sameDay(day, today);
          // Light buckets (0–2) read with dark text; deep buckets (3–5) with white.
          const textColor = bucket >= 3 ? "#ffffff" : "var(--on-accent)";
          const title = hasData
            ? `${day.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}: avg ${avgFree.toFixed(1)}/${total} free`
            : day.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
          return (
            <button
              key={i}
              type="button"
              title={title}
              onClick={() => onPick(day)}
              style={{ backgroundColor: `var(--av-${bucket})`, color: textColor }}
              className={`flex h-14 flex-col items-center justify-center rounded-md text-sm font-semibold tabular transition-colors duration-200 ease-soft hover:ring-2 hover:ring-inset hover:ring-honey-500 ${
                inMonth ? "" : "opacity-40"
              } ${isToday ? "ring-2 ring-inset ring-honey-600" : ""}`}
            >
              <span>{day.getDate()}</span>
              {hasData && (
                <span className="text-[10px] font-medium opacity-80">
                  {Math.round(ratio * 100)}%
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Week / Day views (slot grid) ─────────────────────────────────────────────

function SlotGrid({
  days,
  rowTimes,
  byTime,
}: {
  days: Date[];
  rowTimes: number[];
  byTime: Map<number, Slot>;
}) {
  const gridTemplateColumns = `44px repeat(${days.length}, 1fr)`;
  return (
    <div style={{ minWidth: days.length > 1 ? 480 : 200 }}>
      {/* Header row */}
      <div className="grid gap-[3px]" style={{ gridTemplateColumns }}>
        <div />
        {days.map((d, i) => (
          <div key={i} className="pb-1.5 text-center">
            <div className="text-xs font-semibold text-ink">
              {d.toLocaleDateString(undefined, { weekday: "short" })}
            </div>
            <div className="text-time">{d.getDate()}</div>
          </div>
        ))}
      </div>

      {/* Slot rows */}
      {rowTimes.map((minutes) => {
        const hh = Math.floor(minutes / 60);
        const mm = minutes % 60;
        const showLabel = mm === 0;
        return (
          <div
            key={minutes}
            className="grid gap-[3px] pb-[3px]"
            style={{ gridTemplateColumns }}
          >
            <div className="pr-1.5 text-right text-time leading-[18px]">
              {showLabel ? `${((hh + 11) % 12) + 1}${hh < 12 ? "a" : "p"}` : ""}
            </div>
            {days.map((day, di) => {
              const cell = new Date(day);
              cell.setHours(hh, mm, 0, 0);
              const slot = byTime.get(cell.getTime());
              return (
                <HeatCell
                  key={di}
                  slot={slot}
                  label={cell.toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Bucket the free-count into the 6-step deep-pine ramp (av-0..av-5). We bucket
// rather than map 1:1 so the scale reads with up to 15 people (DESIGN-BRIEF) —
// 0 free = av-0 (warm empty), everyone free = av-5 (the signal), the middle is
// split across av-1..av-4 by share-of-group.
function avBucket(freeCount: number, total: number, everyoneFree: boolean) {
  if (freeCount <= 0) return 0;
  if (everyoneFree) return 5;
  const ratio = freeCount / total;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function HeatCell({ slot, label }: { slot?: Slot; label: string }) {
  if (!slot || slot.total_members === 0) {
    // Warm empty — sits in the cream family (charcoal family in dark), never a grey box.
    return <div className="h-[18px] rounded-[5px] bg-av-0" aria-hidden />;
  }
  const bucket = avBucket(slot.free_count, slot.total_members, slot.everyone_free);
  // Cell text: ink on the light end (av-0..2), white on the dark end (av-3..5).
  // av-1/av-2 are light greens in BOTH themes, so their number stays dark
  // (--on-accent, constant); av-3..5 are deep enough for white. (bucket 0 = no number.)
  const textColor = bucket >= 3 ? "#ffffff" : "var(--on-accent)";
  // The quorum verdict only differs from "everyone" when a quorum < total is
  // set, so naming it in the tooltip stays informative either way.
  const quorumNote =
    slot.quorum < slot.total_members ? ` (quorum ${slot.quorum})` : "";
  const title = `${label}: ${slot.free_count}/${slot.total_members} free${quorumNote}`;

  // "Good enough" quorum slots get a honey inset outline (a shape cue, not a
  // second hue — survives colourblindness, per DESIGN-BRIEF) on top of the ramp.
  // "Everyone free" (av-5) is the signal on its own and needs no ring.
  const quorumRing =
    slot.meets_quorum && !slot.everyone_free && slot.quorum < slot.total_members
      ? " ring-2 ring-inset ring-honey-500"
      : "";
  return (
    <div
      title={title}
      style={{ backgroundColor: `var(--av-${bucket})`, color: textColor }}
      className={`flex h-[18px] items-center justify-center rounded-[5px] text-[10px] font-semibold tabular transition-colors duration-200 ease-soft${quorumRing}`}
    >
      {slot.free_count > 0 ? slot.free_count : ""}
    </div>
  );
}

function Legend({
  loading,
  total,
  quorum,
  view,
}: {
  loading: boolean;
  total: number;
  quorum: number;
  view: View;
}) {
  // Quorum is a per-slot verdict — only meaningful in the slot grids, not the
  // month's daily average.
  const showQuorum = view !== "month" && quorum > 0 && quorum < total;
  const rampLabel = view === "month" ? "less → more free" : "none → everyone free";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
      {loading ? (
        <span>Loading availability…</span>
      ) : (
        <>
          {/* The ramp itself — least → most free, so the legend doubles as a key. */}
          <span className="flex items-center gap-1.5">
            <span className="flex gap-px">
              {[0, 1, 2, 3, 4, 5].map((b) => (
                <span
                  key={b}
                  className="h-3 w-3 rounded-[3px]"
                  style={{ backgroundColor: `var(--av-${b})` }}
                />
              ))}
            </span>
            <span>{rampLabel}</span>
          </span>
          {showQuorum && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-[3px] ring-2 ring-inset ring-honey-500"
                style={{ backgroundColor: "var(--av-3)" }}
              />
              Quorum ({quorum}+)
            </span>
          )}
          <span className="ml-auto tabular">
            {total} member{total === 1 ? "" : "s"}
          </span>
        </>
      )}
    </div>
  );
}
