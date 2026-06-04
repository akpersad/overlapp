"use client";

import { useActionState, useEffect, useState } from "react";

import { finishOnboarding } from "@/lib/actions/profile";
import { btnPrimary, errorText, input, label } from "@/lib/ui";

export function OnboardingForm({
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
  const [state, action, pending] = useActionState(finishOnboarding, undefined);
  const [tz, setTz] = useState(timeZone);

  // Re-detect the browser time zone in case it differs from signup metadata.
  useEffect(() => {
    // One-shot read of a browser-only API (no SSR equivalent) into state.
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (detected) setTz(detected);
    } catch {
      /* keep stored value */
    }
  }, []);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="first_name" value={firstName} />
      <input type="hidden" name="last_name" value={lastName} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="display_name" className={label}>
          Display name <span className="text-zinc-400">(optional)</span>
        </label>
        <input
          id="display_name"
          name="display_name"
          defaultValue={displayName}
          placeholder={`${firstName} ${lastName.charAt(0)}.`}
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
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className={input}
        />
        <p className="text-xs text-zinc-500">
          Detected automatically — availability is always shown in your local
          time.
        </p>
      </div>
      {state && "error" in state && <p className={errorText}>{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Setting up…" : "Get started"}
      </button>
    </form>
  );
}
