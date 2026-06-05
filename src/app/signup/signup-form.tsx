"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { signUp } from "@/lib/actions/auth";
import { btnPrimary, errorText, input, label } from "@/lib/ui";

export function SignupForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action, pending] = useActionState(signUp, undefined);
  // Auto-detect the IANA time zone (spec §User data: required, auto-detected).
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => {
    // One-shot read of a browser-only API (no SSR equivalent) into state.
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (tz) setTimeZone(tz);
    } catch {
      // keep UTC fallback
    }
  }, []);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
      <input type="hidden" name="time_zone" value={timeZone} />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="first_name" className={label}>
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            autoComplete="given-name"
            required
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
            autoComplete="family-name"
            required
            className={input}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={input}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={label}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={input}
        />
        <p className="text-xs text-ink-muted">At least 8 characters.</p>
      </div>
      {state?.error && <p className={errorText}>{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-honey-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}
