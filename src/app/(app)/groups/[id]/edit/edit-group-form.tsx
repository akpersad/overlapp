"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { updateGroup } from "@/lib/actions/groups";
import { btnPrimary, errorText, input, label } from "@/lib/ui";

type Group = {
  id: string;
  name: string;
  description: string | null;
  slot_minutes: number;
  join_policy: "open" | "approval";
  quorum: number | null;
};

export function EditGroupForm({ group }: { group: Group }) {
  const [state, action, pending] = useActionState(updateGroup, undefined);
  const router = useRouter();

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="group_id" value={group.id} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={label}>
          Group name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={group.name}
          className={input}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={label}>
          Description
        </label>
        <input
          id="description"
          name="description"
          defaultValue={group.description ?? ""}
          className={input}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="slot_minutes" className={label}>
            Slot size
          </label>
          <select
            id="slot_minutes"
            name="slot_minutes"
            defaultValue={String(group.slot_minutes)}
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
            defaultValue={group.join_policy}
            className={input}
          >
            <option value="open">Open link</option>
            <option value="approval">Approval required</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="quorum" className={label}>
          Quorum <span className="text-ink-subtle">(how many free counts as &ldquo;good enough&rdquo;)</span>
        </label>
        <input
          id="quorum"
          name="quorum"
          type="number"
          min={1}
          max={15}
          defaultValue={group.quorum ?? ""}
          placeholder="Everyone"
          className={input}
        />
        <p className="text-xs text-ink-muted">
          Leave blank to require everyone. Set e.g. 4 to highlight slots where at
          least 4 members are free.
        </p>
      </div>
      {state?.error && <p className={errorText}>{state.error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/groups/${group.id}`)}
          className="text-sm text-ink-muted hover:underline"
        >
          Done
        </button>
      </div>
    </form>
  );
}
