"use client";

import { useActionState, useMemo, useState } from "react";

import { createProposal } from "@/lib/actions/proposals";
import { btnPrimary, btnSecondary, errorText, input, label } from "@/lib/ui";

// One candidate slot, expressed in the proposer's local time (converted to UTC
// ISO on submit, like the manual-block editor).
type Draft = { id: number; date: string; start: string; end: string };

function localToIso(date: string, time: string): string {
  if (!date || !time) return "";
  const d = new Date(`${date}T${time}`); // local time
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

// Split an ISO instant into the local date + time strings the inputs use.
function isoToLocalParts(iso?: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

let nextId = 1;

export function ProposeForm({
  groupId,
  initialTitle = "",
  initialStart,
  initialEnd,
}: {
  groupId: string;
  initialTitle?: string;
  initialStart?: string;
  initialEnd?: string;
}) {
  const [state, action, pending] = useActionState(createProposal, undefined);
  // Seed the first candidate from a recurring-hangout occurrence when present
  // (Phase 4 "Propose this"); otherwise an empty default slot.
  const seeded = isoToLocalParts(initialStart);
  const seededEnd = isoToLocalParts(initialEnd);
  const [drafts, setDrafts] = useState<Draft[]>([
    {
      id: 0,
      date: seeded.date,
      start: seeded.time || "18:00",
      end: seededEnd.time || "19:00",
    },
  ]);

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

  const options = useMemo(
    () =>
      drafts
        .map((d) => ({
          starts_at: localToIso(d.date, d.start),
          ends_at: localToIso(d.date, d.end),
        }))
        .filter((o) => o.starts_at && o.ends_at),
    [drafts],
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="options" value={JSON.stringify(options)} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className={label}>
          What&apos;s the event?
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={initialTitle}
          placeholder="e.g. Dinner, Board game night"
          className={input}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={label}>
          Details <span className="text-zinc-400">(optional)</span>
        </label>
        <input id="description" name="description" className={input} />
      </div>

      <div className="flex flex-col gap-2">
        <span className={label}>Candidate times</span>
        {drafts.map((d) => (
          <div key={d.id} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] text-zinc-400">Date</span>
              <input
                type="date"
                value={d.date}
                onChange={(e) => update(d.id, { date: e.target.value })}
                className={input}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-400">From</span>
              <input
                type="time"
                value={d.start}
                onChange={(e) => update(d.id, { start: e.target.value })}
                className={input}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-400">To</span>
              <input
                type="time"
                value={d.end}
                onChange={(e) => update(d.id, { end: e.target.value })}
                className={input}
                required
              />
            </div>
            <button
              type="button"
              onClick={() => removeDraft(d.id)}
              disabled={drafts.length === 1}
              className="pb-2 text-xs text-red-600 hover:underline disabled:opacity-30"
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addDraft}
          className={`${btnSecondary} self-start !py-1 !text-xs`}
        >
          + Add another time
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pinned_tz" className={label}>
          Pin a time zone <span className="text-zinc-400">(optional)</span>
        </label>
        <input
          id="pinned_tz"
          name="pinned_tz"
          placeholder="e.g. America/New_York"
          className={input}
        />
        <p className="text-xs text-zinc-500">
          Use when the event&apos;s zone matters (e.g. a flight). Otherwise times
          show in each member&apos;s local zone.
        </p>
      </div>

      {state?.error && <p className={errorText}>{state.error}</p>}
      <button
        type="submit"
        disabled={pending || options.length === 0}
        className={btnPrimary}
      >
        {pending ? "Creating…" : "Send proposal"}
      </button>
    </form>
  );
}
