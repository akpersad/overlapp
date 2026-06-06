"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";

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
// ISO on submit, like the manual-block editor). State lives in the parent
// ProposeWorkspace so the calendar's drag-select and these fields share it.
export type Draft = { id: number; date: string; start: string; end: string };

export function localToIso(date: string, time: string): string {
  if (!date || !time) return "";
  const d = new Date(`${date}T${time}`); // local time
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

export function ProposeForm({
  groupId,
  initialTitle = "",
  drafts,
  onUpdate,
  onAdd,
  onRemove,
}: {
  groupId: string;
  initialTitle?: string;
  drafts: Draft[];
  onUpdate: (id: number, patch: Partial<Draft>) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
}) {
  const [state, action, pending] = useActionState(createProposal, undefined);

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
        <p className="text-xs text-ink-muted">
          Drag on the calendar to add a time, or set one by hand here.
        </p>
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
                onClick={() => onRemove(d.id)}
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
                onChange={(e) => onUpdate(d.id, { date: e.target.value })}
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
                  onChange={(e) => onUpdate(d.id, { start: e.target.value })}
                  className={input}
                  required
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] text-ink-subtle">To</span>
                <input
                  type="time"
                  value={d.end}
                  onChange={(e) => onUpdate(d.id, { end: e.target.value })}
                  className={input}
                  required
                />
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
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
