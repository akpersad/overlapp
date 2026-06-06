"use client";

import { useMemo, useState } from "react";

import { card } from "@/lib/ui";
import { Heatmap, type Selection } from "../../heatmap";
import { ProposeForm, type Draft } from "./propose-form";

// ── Local time helpers (mirror the form's date+time string shape) ─────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** Split an ISO instant into the local date + time strings the inputs use. */
function isoToLocalParts(iso?: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** "yyyy-mm-dd" for a local Date. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Minutes-from-midnight → "HH:mm". */
function minutesToTime(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** "HH:mm" → minutes-from-midnight, or null if unparseable. */
function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Module-scoped id counter shared with the form's notion of drafts.
let nextId = 1;

export function ProposeWorkspace({
  groupId,
  slotMinutes,
  initialTitle = "",
  initialStart,
  initialEnd,
}: {
  groupId: string;
  slotMinutes: number;
  initialTitle?: string;
  initialStart?: string;
  initialEnd?: string;
}) {
  // Single source of truth for candidate slots. The calendar's drag-select
  // writes here; the form's date/time fields read and edit the same drafts.
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    // Seed the first candidate from a recurring-hangout occurrence when present
    // (Phase 4 "Propose this"); otherwise an empty default slot to fill by drag.
    const seeded = isoToLocalParts(initialStart);
    const seededEnd = isoToLocalParts(initialEnd);
    return [
      {
        id: 0,
        date: seeded.date,
        start: seeded.time || "18:00",
        end: seededEnd.time || "19:00",
      },
    ];
  });

  function update(id: number, patch: Partial<Draft>) {
    setDrafts((cur) => cur.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function addDraft() {
    setDrafts((cur) => [
      ...cur,
      { id: nextId++, date: "", start: "18:00", end: "19:00" },
    ]);
  }
  function removeDraft(id: number) {
    setDrafts((cur) => (cur.length > 1 ? cur.filter((d) => d.id !== id) : cur));
  }

  // A completed drag on the calendar. Fill the first dateless draft (so the
  // default empty Option 1 becomes the first dragged range) — otherwise append
  // a new candidate, which is how multiple ranges (even same-day) accumulate.
  function addFromDrag(day: Date, startMin: number, endMin: number) {
    const patch = {
      date: ymd(day),
      start: minutesToTime(startMin),
      end: minutesToTime(endMin),
    };
    setDrafts((cur) => {
      const emptyIdx = cur.findIndex((d) => !d.date);
      if (emptyIdx >= 0) {
        return cur.map((d, i) => (i === emptyIdx ? { ...d, ...patch } : d));
      }
      return [...cur, { id: nextId++, ...patch }];
    });
  }

  // Drafts → calendar overlays. Skip incomplete/invalid ranges so a half-edited
  // field doesn't paint a stray highlight.
  const selections = useMemo<Selection[]>(() => {
    const out: Selection[] = [];
    for (const d of drafts) {
      if (!d.date) continue;
      const startMin = timeToMinutes(d.start);
      const endMin = timeToMinutes(d.end);
      if (startMin == null || endMin == null || endMin <= startMin) continue;
      const day = new Date(`${d.date}T00:00`); // local midnight
      if (isNaN(day.getTime())) continue;
      out.push({ dayMs: day.getTime(), startMin, endMin });
    }
    return out;
  }, [drafts]);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className={`${card} min-w-0`}>
        <ProposeForm
          groupId={groupId}
          initialTitle={initialTitle}
          drafts={drafts}
          onUpdate={update}
          onAdd={addDraft}
          onRemove={removeDraft}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-4">
        <h2 className="text-sm font-semibold text-ink">Group availability</h2>
        <p className="text-xs text-ink-muted">
          Deeper = more people free. Open a day, then drag across the times you
          want — each drag adds a candidate option on the left.
        </p>
        <div className={card}>
          <Heatmap
            groupId={groupId}
            slotMinutes={slotMinutes}
            selectable
            selections={selections}
            onSelect={addFromDrag}
          />
        </div>
      </div>
    </div>
  );
}
