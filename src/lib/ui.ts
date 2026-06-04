// Shared Tailwind class strings. Visual design is deliberately deferred until
// after P1's core loop works (DESIGN-PRINCIPLES.md) — these are functional,
// mobile-first, one-accent-colour defaults, not the final look.

export const btn =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const btnPrimary = `${btn} bg-indigo-600 text-white hover:bg-indigo-500`;

export const btnSecondary = `${btn} border border-zinc-300 text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800`;

export const btnDanger = `${btn} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950`;

export const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export const label =
  "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export const card =
  "rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900";

export const errorText = "text-sm text-red-600 dark:text-red-400";
