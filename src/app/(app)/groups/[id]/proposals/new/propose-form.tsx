"use client";

import {
  useActionState,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { createProposal } from "@/lib/actions/proposals";
import { btnPrimary, btnSecondary, errorText, input, label } from "@/lib/ui";

// The full IANA zone list, sourced from the runtime's own ICU data so it never
// drifts out of date. Computed lazily on the client (see the `mounted` guard in
// the component) to dodge any server/browser ICU-version hydration mismatch.
function tzList(): string[] {
  try {
    // supportedValuesOf is widely supported in modern browsers; guard anyway.
    const sv = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    return sv ? sv("timeZone") : [];
  } catch {
    return [];
  }
}

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

  // Pinned time zone is optional (empty = each member sees their own local
  // zone). The dropdown is populated client-side only — see `tzList` — so we
  // render just the default option during SSR/first paint and fill the list
  // after mount to avoid a hydration mismatch from ICU-version drift.
  const [pinnedTz, setPinnedTz] = useState("");
  // "false during SSR + first client render, true after hydration" without a
  // setState-in-effect (the subscription never fires) — same pattern the
  // heatmap uses to gate clock/locale-dependent rendering past hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const zones = useMemo(() => (mounted ? tzList() : []), [mounted]);
  const localTz = useMemo(() => {
    if (!mounted) return "";
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return "";
    }
  }, [mounted]);

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
          Details <span className="text-ink-subtle">(optional)</span>
        </label>
        <input id="description" name="description" className={input} />
      </div>

      <div className="flex flex-col gap-3">
        <span className={label}>Candidate times</span>
        {drafts.map((d, i) => (
          <div
            key={d.id}
            className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken/40 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                Option {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeDraft(d.id)}
                disabled={drafts.length === 1}
                className="text-xs text-red-700 hover:underline disabled:opacity-30 dark:text-red-300"
              >
                Remove
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-ink-subtle">Date</span>
              <input
                type="date"
                value={d.date}
                onChange={(e) => update(d.id, { date: e.target.value })}
                className={input}
                required
              />
            </div>
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] text-ink-subtle">From</span>
                <input
                  type="time"
                  value={d.start}
                  onChange={(e) => update(d.id, { start: e.target.value })}
                  className={input}
                  required
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] text-ink-subtle">To</span>
                <input
                  type="time"
                  value={d.end}
                  onChange={(e) => update(d.id, { end: e.target.value })}
                  className={input}
                  required
                />
              </div>
            </div>
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
          Pin a time zone <span className="text-ink-subtle">(optional)</span>
        </label>
        <select
          id="pinned_tz"
          name="pinned_tz"
          value={pinnedTz}
          onChange={(e) => setPinnedTz(e.target.value)}
          className={input}
        >
          <option value="">
            Each member&apos;s local time
            {localTz ? ` (yours: ${localTz})` : ""}
          </option>
          {zones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-muted">
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
