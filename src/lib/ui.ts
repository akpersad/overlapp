// Shared Tailwind class strings — Phase 7 tokenized (docs/DESIGN-BRIEF.md).
// Everything flows through the semantic design tokens (honey brand, cream
// neutrals); no raw zinc-*/indigo-*. Dark mode rides the token swap, so these
// classes need no `dark:` variants.

// Honey focus ring — 2px ring + 2px offset on the page background (cream/charcoal).
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-honey-300 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export const btn =
  `inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 ease-soft disabled:opacity-50 disabled:pointer-events-none ${focusRing}`;

// Primary = honey-500 fill + ink text (NOT white — white fails contrast on honey).
export const btnPrimary = `${btn} bg-honey-500 text-ink shadow-xs hover:bg-honey-600`;

export const btnSecondary = `${btn} border border-border-strong bg-surface text-ink hover:bg-surface-sunken`;

export const btnDanger = `${btn} border border-border-strong text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40`;

export const input =
  `w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle outline-none transition-colors duration-150 focus:border-honey-300 focus:ring-2 focus:ring-honey-300/40`;

export const label = "block text-sm font-medium text-ink-muted";

export const card =
  "rounded-lg border border-border bg-surface p-5 shadow-sm";

export const errorText = "text-sm text-red-600 dark:text-red-400";
