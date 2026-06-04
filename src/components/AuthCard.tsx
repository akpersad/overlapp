import Link from "next/link";

import { card } from "@/lib/ui";

// Centered card shell shared by the login / signup / verify screens.
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 block text-center text-xl font-bold tracking-tight text-indigo-600"
        >
          Overlapp
        </Link>
        <div className={card}>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
          <div className={subtitle ? "" : "mt-4"}>{children}</div>
        </div>
      </div>
    </div>
  );
}
