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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 block text-center font-display text-2xl font-extrabold tracking-tight text-honey-700"
        >
          Overlapp
        </Link>
        <div className={card}>
          <h1 className="text-h2 text-ink">{title}</h1>
          {subtitle && (
            <p className="mt-1 mb-4 text-body-sm text-ink-muted">{subtitle}</p>
          )}
          <div className={subtitle ? "" : "mt-4"}>{children}</div>
        </div>
      </div>
    </div>
  );
}
