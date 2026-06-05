"use client";

import { useActionState } from "react";

import { createGroup } from "@/lib/actions/groups";
import { btnPrimary, errorText, input, label } from "@/lib/ui";

export function CreateGroupForm() {
  const [state, action, pending] = useActionState(createGroup, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={label}>
          Group name
        </label>
        <input id="name" name="name" required className={input} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={label}>
          Description <span className="text-ink-subtle">(optional)</span>
        </label>
        <input id="description" name="description" className={input} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="slot_minutes" className={label}>
            Slot size
          </label>
          <select
            id="slot_minutes"
            name="slot_minutes"
            defaultValue="30"
            className={input}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="join_policy" className={label}>
            Joining
          </label>
          <select
            id="join_policy"
            name="join_policy"
            defaultValue="open"
            className={input}
          >
            <option value="open">Open link</option>
            <option value="approval">Approval required</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="quorum" className={label}>
          Quorum <span className="text-ink-subtle">(optional)</span>
        </label>
        <input
          id="quorum"
          name="quorum"
          type="number"
          min={1}
          max={15}
          placeholder="Everyone"
          className={input}
        />
        <p className="text-xs text-ink-muted">
          How many free counts as &ldquo;good enough.&rdquo; Leave blank to
          require everyone.
        </p>
      </div>

      {state?.error && <p className={errorText}>{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}
