"use client";

import { useActionState } from "react";

import { updatePassword } from "@/lib/actions/auth";
import { btnPrimary, errorText, input, label } from "@/lib/ui";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={label}>
          New password
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm_password" className={label}>
          Confirm password
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={input}
        />
      </div>
      {state?.error && <p className={errorText}>{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
