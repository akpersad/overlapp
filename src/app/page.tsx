import Link from "next/link";

import { getUser } from "@/lib/auth";
import { btnPrimary, btnSecondary } from "@/lib/ui";

export default async function Home() {
  const user = await getUser();

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-black">
      <header className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4">
        <span className="text-lg font-bold tracking-tight text-indigo-600">
          Overlapp
        </span>
        {user ? (
          <Link href="/dashboard" className={btnSecondary}>
            Go to dashboard
          </Link>
        ) : (
          <Link href="/login" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Sign in
          </Link>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-20 text-center">
        <div className="flex flex-col gap-4">
          <h1 className="text-balance text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
            Stop asking{" "}
            <span className="text-indigo-600">&ldquo;when&apos;s everyone free?&rdquo;</span>
          </h1>
          <p className="text-balance text-lg text-zinc-600 dark:text-zinc-400">
            Overlapp is a persistent shared calendar for your group. Everyone&apos;s
            availability lives in one place, so the best time to meet is answered
            before anyone asks.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {user ? (
            <Link href="/dashboard" className={btnPrimary}>
              Open your groups
            </Link>
          ) : (
            <>
              <Link href="/signup" className={btnPrimary}>
                Get started — free
              </Link>
              <Link href="/login" className={btnSecondary}>
                Sign in
              </Link>
            </>
          )}
        </div>

        <ul className="mt-6 grid gap-4 text-left sm:grid-cols-3">
          {[
            {
              t: "Always up to date",
              d: "Availability is a living layer, not a one-off poll you throw away.",
            },
            {
              t: "Private by design",
              d: "Members see only free/busy — never your event titles or details.",
            },
            {
              t: "Tap the green slot",
              d: "The group heatmap highlights when everyone can actually make it.",
            },
          ].map((f) => (
            <li
              key={f.t}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                {f.t}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {f.d}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
