"use client";

import { useActionState } from "react";
import Link from "next/link";

import { requestPasswordReset } from "@/lib/actions/auth";
import { btnPrimary, errorText, input, label } from "@/lib/ui";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  if (state && "ok" in state) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-ink-muted">
          If an account exists for that address, a reset link is on its way. Check
          your inbox (and spam folder), then follow the link to set a new password.
        </p>
        <Link href="/login" className="text-center text-sm font-medium text-honey-700">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
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
      {state?.error && <p className={errorText}>{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-honey-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}
