"use client";

import { useActionState, useMemo, useState } from "react";

import { addBlock } from "@/lib/actions/blocks";
import { buildRrule, WEEKDAYS, weekdayLabel, type Repeat, type Weekday } from "@/lib/rrule";
import { btnPrimary, btnSecondary, errorText, input, label } from "@/lib/ui";

function localToIso(date: string, time: string): string {
  if (!date || !time) return "";
  const d = new Date(`${date}T${time}`); // parsed as local time
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

export function BlockForm() {
  const [state, action, pending] = useActionState(addBlock, undefined);

  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [days, setDays] = useState<Weekday[]>([]);

  const startsAt = useMemo(() => localToIso(date, start), [date, start]);
  const endsAt = useMemo(() => localToIso(date, end), [date, end]);
  const rrule = useMemo(() => buildRrule(repeat, days), [repeat, days]);

  function toggleDay(d: Weekday) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* Hidden, derived UTC + RRULE values the server action reads. */}
      <input type="hidden" name="starts_at" value={startsAt} />
      <input type="hidden" name="ends_at" value={endsAt} />
      <input type="hidden" name="rrule" value={rrule ?? ""} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="label" className={label}>
          Label <span className="text-ink-subtle">(optional, only you see it)</span>
        </label>
        <input
          id="label"
          name="label"
          placeholder="e.g. Work, Gym, Sleep"
          className={input}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className={label}>
            Date
          </label>
          <input
            id="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="start" className={label}>
            From
          </label>
          <input
            id="start"
            type="time"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="end" className={label}>
            To
          </label>
          <input
            id="end"
            type="time"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={input}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={label}>Repeat</span>
        <div className="flex gap-2">
          {(["none", "daily", "weekly"] as Repeat[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRepeat(r)}
              className={repeat === r ? btnPrimary : btnSecondary}
            >
              {r === "none" ? "Once" : r === "daily" ? "Daily" : "Weekly"}
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
                    ? "border-honey-500 bg-honey-500 text-on-accent"
                    : "border-border-strong text-ink-muted hover:bg-surface-sunken"
                }`}
              >
                {weekdayLabel(d)}
              </button>
            ))}
          </div>
        )}
      </div>

      {state?.error && <p className={errorText}>{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Adding…" : "Add block"}
      </button>
    </form>
  );
}
