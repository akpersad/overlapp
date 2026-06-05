"use client";

import { useActionState } from "react";

import { updateProfile } from "@/lib/actions/profile";
import { btnPrimary, errorText, input, label } from "@/lib/ui";

export function ProfileForm({
  firstName,
  lastName,
  displayName,
  timeZone,
}: {
  firstName: string;
  lastName: string;
  displayName: string;
  timeZone: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const saved = state && "ok" in state && state.ok;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="first_name" className={label}>
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            required
            defaultValue={firstName}
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="last_name" className={label}>
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            required
            defaultValue={lastName}
            className={input}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="display_name" className={label}>
          Display name <span className="text-ink-subtle">(optional)</span>
        </label>
        <input
          id="display_name"
          name="display_name"
          defaultValue={displayName}
          className={input}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="time_zone" className={label}>
          Time zone
        </label>
        <input
          id="time_zone"
          name="time_zone"
          required
          defaultValue={timeZone}
          className={input}
        />
      </div>
      {state && "error" in state && <p className={errorText}>{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-sm text-av-5">
            Saved ✓
          </span>
        )}
      </div>
    </form>
  );
}
