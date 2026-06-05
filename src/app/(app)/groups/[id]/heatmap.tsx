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
  // Bumped by a realtime broadcast to silently re-fetch the current week when a
  // member's availability (or the group itself) changes (Phase 5 — live heatmap).
  const [liveTick, setLiveTick] = useState(0);

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
  }, [groupId, slotMinutes, start, cacheKey, liveTick]);

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
          className="rounded-md px-2.5 py-1 text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          ← Prev
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-ink tabular">{weekLabel}</p>
          {weekOffset !== 0 && (
            <button
              onClick={() => goToWeek(() => 0)}
              className="text-xs font-medium text-honey-700 hover:underline"
            >
              This week
            </button>
          )}
        </div>
        <button
          onClick={() => goToWeek((w) => w + 1)}
          className="rounded-md px-2.5 py-1 text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          Next →
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {stale && (
        <p className="rounded-md bg-honey-50 px-2.5 py-1.5 text-xs font-medium text-honey-900">
          Offline — showing the last saved availability for this week.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg bg-surface-sunken p-3">
        <div className="min-w-[480px]">
          {/* Header row */}
          <div className="grid grid-cols-[44px_repeat(7,1fr)] gap-[3px]">
            <div />
            {days.map((d, i) => (
              <div key={i} className="pb-1.5 text-center">
                <div className="text-xs font-semibold text-ink">
                  {DAY_LABELS[i]}
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
                className="grid grid-cols-[44px_repeat(7,1fr)] gap-[3px] pb-[3px]"
              >
                <div className="pr-1.5 text-right text-time leading-[18px]">
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
}: {
  loading: boolean;
  total: number;
  quorum: number;
}) {
  const showQuorum = quorum > 0 && quorum < total;
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
            <span>none → everyone free</span>
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
