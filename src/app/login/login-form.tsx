"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signIn } from "@/lib/actions/auth";
import { btnPrimary, errorText, input, label } from "@/lib/ui";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
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
        <div className="flex items-center justify-between">
          <label htmlFor="password" className={label}>
            Password
          </label>
          <Link href="/forgot-password" className="text-sm font-medium text-honey-700">
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={input}
        />
      </div>
      {state?.error && <p className={errorText}>{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-ink-muted">
        No account?{" "}
        <Link href="/signup" className="font-medium text-honey-700">
          Sign up
        </Link>
      </p>
    </form>
  );
}
