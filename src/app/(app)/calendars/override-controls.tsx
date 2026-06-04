"use client";

import { useRef } from "react";

import { setCategoryOverride, setEventOverride } from "@/lib/actions/calendars";

const selectClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

// Per-event override: Default / Free / Blocked. Auto-submits on change.
export function EventOverrideForm({
  eventId,
  current,
}: {
  eventId: string;
  current: "free" | "blocked" | null;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={setEventOverride}>
      <input type="hidden" name="event_id" value={eventId} />
      <select
        name="override"
        defaultValue={current ?? ""}
        onChange={() => ref.current?.requestSubmit()}
        className={selectClass}
        aria-label="Event availability override"
      >
        <option value="">Default</option>
        <option value="free">Free</option>
        <option value="blocked">Busy</option>
      </select>
    </form>
  );
}

// Per-category override: Default (remove) / Free / Blocked. Auto-submits.
export function CategoryOverrideForm({
  category,
  current,
}: {
  category: string;
  current: "free" | "blocked" | null;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={setCategoryOverride}>
      <input type="hidden" name="category" value={category} />
      <select
        name="state"
        defaultValue={current ?? "remove"}
        onChange={() => ref.current?.requestSubmit()}
        className={selectClass}
        aria-label={`Default availability for ${category} events`}
      >
        <option value="remove">Use provider</option>
        <option value="free">Always free</option>
        <option value="blocked">Always busy</option>
      </select>
    </form>
  );
}
