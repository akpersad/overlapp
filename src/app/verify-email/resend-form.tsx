"use client";

import { useActionState } from "react";

import { resendVerification } from "@/lib/actions/auth";
import { btnSecondary, errorText, input, label } from "@/lib/ui";

// Escape hatch for a missed/expired confirmation email. The address is
// pre-filled from signup when we have it; otherwise the user types it in.
export function ResendForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(resendVerification, undefined);

  if (state && "ok" in state) {
    return (
      <p className="text-body-sm text-ink-muted">
        Sent — check your inbox (and spam folder) for the new confirmation link.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
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
      )}
      {state?.error && <p className={errorText}>{state.error}</p>}
      <button type="submit" disabled={pending} className={btnSecondary}>
        {pending ? "Resending…" : "Resend confirmation email"}
      </button>
    </form>
  );
}
