"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Thumb-reachable bottom tab bar for mobile (hidden on sm+). The dense top nav
// doesn't fit a 375–430px phone, so primary navigation lives here on mobile
// while the top bar slims to wordmark + avatar. Active tab = honey.

type Tab = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  icon: React.ReactNode;
};

const sw = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const TABS: Tab[] = [
  {
    href: "/dashboard",
    label: "Groups",
    match: (p) => p === "/dashboard" || p.startsWith("/groups"),
    icon: (
      <svg viewBox="0 0 24 24" {...sw} className="h-6 w-6">
        <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
        <circle cx="10" cy="8" r="3" />
        <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15 5.1a3 3 0 0 1 0 5.8" />
      </svg>
    ),
  },
  {
    href: "/availability",
    label: "Availability",
    match: (p) => p.startsWith("/availability"),
    icon: (
      <svg viewBox="0 0 24 24" {...sw} className="h-6 w-6">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 1.8" />
      </svg>
    ),
  },
  {
    href: "/calendars",
    label: "Calendars",
    match: (p) => p.startsWith("/calendars"),
    icon: (
      <svg viewBox="0 0 24 24" {...sw} className="h-6 w-6">
        <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
        <path d="M4 9.5h16M8 3.5v4M16 3.5v4" />
      </svg>
    ),
  },
  {
    href: "/notifications",
    label: "Inbox",
    match: (p) => p.startsWith("/notifications"),
    icon: (
      <svg viewBox="0 0 24 24" {...sw} className="h-6 w-6">
        <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9Z" />
        <path d="M10.5 19a2 2 0 0 0 3 0" />
      </svg>
    ),
  },
];

export function BottomNav({ unread }: { unread: number }) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/90 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium whitespace-nowrap transition-colors ${
                  active ? "text-honey-700" : "text-ink-subtle"
                }`}
              >
                <span className="relative">
                  {tab.icon}
                  {tab.label === "Inbox" && unread > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-honey-500 px-1 text-[10px] font-semibold text-on-accent">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
