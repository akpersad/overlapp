"use client";

import { useActionState, useMemo, useState } from "react";

import { createRecurringHangout } from "@/lib/actions/hangouts";
import { buildRrule, WEEKDAYS, weekdayLabel, type Weekday } from "@/lib/rrule";
import { btnPrimary, btnSecondary, errorText, input, label } from "@/lib/ui";

// Define a recurring hangout (Phase 4). Admin-only (rendered only for admins,
// RLS enforces). Mirrors the manual-block editor: a "starting from" anchor date
// + time-of-day in the admin's local zone (converted to UTC on submit) plus a
// repeat rule. Recurrence is required — a one-off is just a proposal.

function localToIso(date: string, time: string): string {
  if (!date || !time) return "";
  const d = new Date(`${date}T${time}`); // parsed as local time
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

export function HangoutForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState(
    createRecurringHangout,
    undefined,
  );
  const [open, setOpen] = useState(false);

  const [date, setDate] = useState("");
  const [start, setStart] = useState("19:00");
  const [end, setEnd] = useState("21:00");
  const [repeat, setRepeat] = useState<"daily" | "weekly">("weekly");
  const [days, setDays] = useState<Weekday[]>([]);

  const startsAt = useMemo(() => localToIso(date, start), [date, start]);
  const endsAt = useMemo(() => localToIso(date, end), [date, end]);
  const rrule = useMemo(() => buildRrule(repeat, days), [repeat, days]);

  function toggleDay(d: Weekday) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btnSecondary} !py-1 !text-xs`}
      >
        + Add a recurring hangout
      </button>
    );
  }

  const canSubmit = Boolean(rrule && startsAt && endsAt);

  return (
    <form action={action} className="mt-2 flex flex-col gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="starts_at" value={startsAt} />
      <input type="hidden" name="ends_at" value={endsAt} />
      <input type="hidden" name="rrule" value={rrule ?? ""} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="hangout_title" className={label}>
          Name
        </label>
        <input
          id="hangout_title"
          name="title"
          required
          placeholder="e.g. Board game night"
          className={input}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="hangout_desc" className={label}>
          Details <span className="text-zinc-400">(optional)</span>
        </label>
        <input id="hangout_desc" name="description" className={input} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hangout_date" className={label}>
            Starting
          </label>
          <input
            id="hangout_date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hangout_start" className={label}>
            From
          </label>
          <input
            id="hangout_start"
            type="time"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hangout_end" className={label}>
            To
          </label>
          <input
            id="hangout_end"
            type="time"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={input}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={label}>Repeats</span>
        <div className="flex gap-2">
          {(["weekly", "daily"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRepeat(r)}
              className={repeat === r ? btnPrimary : btnSecondary}
            >
              {r === "weekly" ? "Weekly" : "Daily"}
            </button>
          ))}
        </div>
        {repeat === "weekly" && (
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  days.includes(d)
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {weekdayLabel(d)}
              </button>
            ))}
          </div>
        )}
        {repeat === "weekly" && days.length === 0 && (
          <p className="text-xs text-zinc-400">Pick at least one day.</p>
        )}
      </div>

      {state?.error && <p className={errorText}>{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !canSubmit}
          className={btnPrimary}
        >
          {pending ? "Saving…" : "Save hangout"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={btnSecondary}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
