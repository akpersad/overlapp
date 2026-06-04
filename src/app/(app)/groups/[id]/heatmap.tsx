"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

// The group heatmap — the product's hero artifact. Renders the aggregated
// availability for one week in the VIEWER's local time zone (browser-local),
// querying the on-the-fly group_heatmap RPC. "Everyone free" slots are the
// signal; intensity ramps a single hue so it survives colourblindness
// (DESIGN-PRINCIPLES) and each cell also shows the free count as text.

const DAY_START_HOUR = 7; // 7am
const DAY_END_HOUR = 23; // 11pm
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Slot = {
  slot_start: string;
  busy_count: number;
  free_count: number;
  total_members: number;
  everyone_free: boolean;
  quorum: number;
  meets_quorum: boolean;
};

/** Monday 00:00 (local) of the week containing `base`, offset by `weeks`. */
function weekStart(base: Date, weeks: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow + weeks * 7);
  return d;
}

export function Heatmap({
  groupId,
  slotMinutes,
}: {
  groupId: string;
  slotMinutes: number;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True when we're showing a cached copy because the network was unreachable
  // (Phase 4 — offline group-calendar view).
  const [stale, setStale] = useState(false);

  const start = useMemo(() => weekStart(new Date(), weekOffset), [weekOffset]);

  // Per-group, per-week cache key. The heatmap is the offline hero: we persist
  // each successfully-loaded week so a previously-opened group calendar still
  // renders without a network, with a clear "last saved" indicator.
  const cacheKey = useMemo(
    () => `overlapp.heatmap.${groupId}.${slotMinutes}.${start.getTime()}`,
    [groupId, slotMinutes, start],
  );

  // Fetch the week's heatmap whenever the group/slot/week changes. setState
  // happens only inside the async resolution (never synchronously in the effect
  // body), and the cancelled flag drops a stale response from a fast week-flip.
  // On a network failure we fall back to the cached copy (stale = true).
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const from = new Date(start);
    const to = new Date(start);
    to.setDate(to.getDate() + 7);

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
        p_slot_minutes: slotMinutes,
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
  }, [groupId, slotMinutes, start, cacheKey]);

  function goToWeek(updater: (w: number) => number) {
    setLoading(true);
    setWeekOffset(updater);
  }

  // Index slots by epoch ms (RPC ISO format differs from Date#toISOString).
  const byTime = useMemo(() => {
    const m = new Map<number, Slot>();
    for (const s of slots) m.set(new Date(s.slot_start).getTime(), s);
    return m;
  }, [slots]);

  const rowTimes = useMemo(() => {
    const times: number[] = [];
    for (let h = DAY_START_HOUR * 60; h < DAY_END_HOUR * 60; h += slotMinutes) {
      times.push(h);
    }
    return times;
  }, [slotMinutes]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [start],
  );

  const weekLabel = `${days[0].toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${days[6].toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => goToWeek((w) => w - 1)}
          className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ← Prev
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {weekLabel}
          </p>
          {weekOffset !== 0 && (
            <button
              onClick={() => goToWeek(() => 0)}
              className="text-xs text-indigo-600 hover:underline"
            >
              This week
            </button>
          )}
        </div>
        <button
          onClick={() => goToWeek((w) => w + 1)}
          className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Next →
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {stale && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Offline — showing the last saved availability for this week.
        </p>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          {/* Header row */}
          <div className="grid grid-cols-[44px_repeat(7,1fr)] gap-px">
            <div />
            {days.map((d, i) => (
              <div key={i} className="pb-1 text-center">
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {DAY_LABELS[i]}
                </div>
                <div className="text-[10px] text-zinc-400">{d.getDate()}</div>
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
                className="grid grid-cols-[44px_repeat(7,1fr)] gap-px"
              >
                <div className="pr-1 text-right text-[10px] leading-5 text-zinc-400">
                  {showLabel
                    ? `${((hh + 11) % 12) + 1}${hh < 12 ? "a" : "p"}`
                    : ""}
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
      </div>

      <Legend
        loading={loading}
        total={slots[0]?.total_members ?? 0}
        quorum={slots[0]?.quorum ?? 0}
      />
    </div>
  );
}

function HeatCell({ slot, label }: { slot?: Slot; label: string }) {
  if (!slot || slot.total_members === 0) {
    return <div className="h-5 rounded-[2px] bg-zinc-100 dark:bg-zinc-800" />;
  }
  const ratio = slot.free_count / slot.total_members;
  // The quorum verdict only differs from "everyone" when a quorum < total is
  // set, so naming it in the tooltip stays informative either way.
  const quorumNote =
    slot.quorum < slot.total_members ? ` (quorum ${slot.quorum})` : "";
  const title = `${label}: ${slot.free_count}/${slot.total_members} free${quorumNote}`;

  if (slot.everyone_free) {
    return (
      <div
        title={title}
        className="flex h-5 items-center justify-center rounded-[2px] bg-indigo-600 text-[10px] font-semibold text-white ring-1 ring-inset ring-indigo-300"
      >
        {slot.free_count}
      </div>
    );
  }
  // "Good enough" quorum slots are outlined (a shape cue, not a second hue — so
  // they survive colourblindness, per DESIGN-PRINCIPLES) on top of the ramp.
  const quorumRing =
    slot.meets_quorum && slot.quorum < slot.total_members
      ? " ring-2 ring-inset ring-indigo-500"
      : "";
  return (
    <div
      title={title}
      style={{ backgroundColor: `rgba(79, 70, 229, ${0.12 + ratio * 0.6})` }}
      className={`flex h-5 items-center justify-center rounded-[2px] text-[10px] text-zinc-700 dark:text-zinc-100${quorumRing}`}
    >
      {slot.free_count > 0 ? slot.free_count : ""}
    </div>
  );
}

function Legend({
  loading,
  total,
  quorum,
}: {
  loading: boolean;
  total: number;
  quorum: number;
}) {
  const showQuorum = quorum > 0 && quorum < total;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
      {loading ? (
        <span>Loading availability…</span>
      ) : (
        <>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[2px] bg-indigo-600 ring-1 ring-inset ring-indigo-300" />
            Everyone free
          </span>
          {showQuorum && (
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-[2px] bg-indigo-300 ring-2 ring-inset ring-indigo-500" />
              Quorum ({quorum}+)
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[2px] bg-indigo-300" />
            Some free
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[2px] bg-zinc-100 dark:bg-zinc-800" />
            None
          </span>
          <span className="ml-auto">
            {total} member{total === 1 ? "" : "s"}
          </span>
        </>
      )}
    </div>
  );
}
