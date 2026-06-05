# Overlapp — Phase 7 Design Brief (Locked Direction)

> Status: LOCKED 2026-06-05 · The implementation source of truth for the Phase 7 visual pass.
> Pairs with [`DESIGN-PRINCIPLES.md`](DESIGN-PRINCIPLES.md) (the *why* / anti-slop guardrails).
> This doc is the *what*: exact tokens, type, motion, and component specs to build against.

## Decisions (settled with the owner)

| Decision | Choice |
|---|---|
| **Tone** | **Warm & social** — friendly, human, a little playful (anti-target: cold utility like When2Meet/Doodle). |
| **Direction** | **#3 "Bright & Friendly"** — Honey brand + deep-Pine availability ramp + sunny cream base. |
| **Type** | **Bricolage Grotesque** (display) + **Inter** (body/UI); **Inter tabular-nums** for the time gutter. |
| **Components** | **Bespoke Tailwind** (no shadcn/Radix) — we own the a11y plumbing. Centralize via tokens + `src/lib/ui.ts`. |
| **Process** | **Code-first** — build foundations + screens in code, review live screenshots, iterate. (Figma ruled out: work-only enterprise seats can't author + IP risk.) |
| **Theme** | **Light/cream-first.** Tokens are semantic CSS variables that also carry dark-mode values, so the existing `dark:` structure keeps working; light is tuned first, dark in a follow pass. |

## Reference board (warm-social)
Source apps studied: **Howbout** (per-group color identity, "planning is part of the party"),
**Partiful** (reserve ONE bold display face for moments; clean grotesque does the work),
**Cron/Notion Calendar** (warm-gray surface, ~9%-opacity grid lines, **monospaced/tabular time numerals**,
high type-scale contrast), **Amie** (single warm accent over neutral; user-toggleable grid density),
**Family** (elements persist+transform across nav; confetti reserved for milestones),
**Cal.com** = the *anti*-reference (grayscale + blue = exactly what to avoid).

## Anti-patterns (auto-fail)
- Cold grayscale + stock Tailwind-blue accent. · Pure `#FFFFFF` page backgrounds (always tint to cream).
- **Red→green** heatmap ramp (CVD-hostile + spreadsheet-cold). · Solid 1px gray Excel gridlines.
- Purple-gradient hero + glassmorphism cards (2023 AI-SaaS template). · Inter-everywhere with no display face.
- Drop shadows on everything / heavy neumorphism. · Feature-triplet + testimonial + pricing landing.

---

## Color tokens

All UI color flows through these semantic tokens (CSS variables in `globals.css`, exposed to Tailwind
via `@theme inline`). Components must reference tokens, **never** raw `zinc-*`/`indigo-*`.

### Neutrals — warm cream (light)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FAF7F0` | page background (sunny cream) |
| `--surface` | `#FFFFFF` | cards / raised panels (lift off cream) |
| `--surface-sunken` | `#F1EDE1` | wells, the heatmap container, inputs-on-cream |
| `--ink` | `#2A2820` | primary text (warm near-black) |
| `--ink-muted` | `#6E665A` | secondary text |
| `--ink-subtle` | `#9C9484` | tertiary / placeholder / time labels |
| `--border` | `rgba(50,40,10,0.10)` | hairline borders, grid lines |
| `--border-strong` | `rgba(50,40,10,0.16)` | input borders, dividers needing weight |

### Brand — honey (the single confident accent)
| Token | Hex | Use |
|---|---|---|
| `--honey-50` | `#FBEFD8` | pill / tag / subtle highlight backgrounds |
| `--honey-100` | `#F8E0B4` | hover wash on tinted surfaces |
| `--honey-300` | `#F2C572` | borders / focus ring on honey elements |
| `--honey-500` | `#EFA94A` | **DEFAULT brand** — primary button fill, active states |
| `--honey-600` | `#E0912E` | hover / pressed |
| `--honey-700` | `#B26A1E` | **text-safe** — links, accent text on cream (passes AA) |
| `--honey-900` | `#7A4712` | deep accent text / icons |

- **Primary button** = `--honey-500` fill + `--ink` text (NOT white — fails contrast). Hover → `--honey-600`.
- **Links / accent text** = `--honey-700` (the only honey value that hits AA on cream for small text).
- Focus ring = `--honey-300` at 2px + 2px offset.

### Availability ramp — deep pine (the hero data scale)
6 buckets. Monochrome green lightness scale → CVD-safe on its own. Bucket the free-count (don't map 1:1 for 15 people).
| Token | Hex | Meaning |
|---|---|---|
| `--av-0` | `#E9E6DA` | none free (warm empty, sits in the cream family — NOT a gray box) |
| `--av-1` | `#CFE0C8` | a few free |
| `--av-2` | `#9CC9A0` | some free |
| `--av-3` | `#5BA678` | most free |
| `--av-4` | `#2D8460` | nearly everyone |
| `--av-5` | `#1A6B50` | **everyone free** (the signal — deepest) |
| `--av-quorum-ring` | `--honey-500` | "good-enough" quorum = **2px honey outline** (shape cue, on top of the green) |

- Cell text: `--ink` on `av-0..av-2`; `#FFFFFF` on `av-3..av-5`. Every non-empty cell shows its free-count number.
- Quorum = outline only; never a hue swap. (Survives CVD + keeps the green ramp readable.)

### Dark mode (warm charcoal — values for the same tokens)
`--bg #1B1915` · `--surface #24211B` · `--surface-sunken #16140F` · `--ink #F3EEE2` · `--ink-muted #B6AD9C` ·
`--ink-subtle #847C6D` · `--border rgba(255,240,210,0.10)` · `--border-strong rgba(255,240,210,0.16)`.
Honey holds (slightly lift `--honey-500`→`#F2B25C` for glow on dark). Ramp: deepen empties
(`--av-0 #2A2820`) and keep the green steps (they read well on charcoal). Tune in the dark pass.

---

## Type
- **Display:** Bricolage Grotesque (variable, opsz). Weights 600–800. Headings, hero, big numbers-of-emphasis.
- **Body/UI:** Inter (variable). 400 body, 500 medium, 600 semibold.
- **Time gutter / aligned numerals:** Inter with `font-variant-numeric: tabular-nums` (fixed-width figures —
  solves vertical alignment without a separate mono font).

### Scale (high contrast, ~Cron 5:1)
| Role | Size / weight / tracking | Family |
|---|---|---|
| display-xl | 52px / 700 / -0.02em / lh 1.02 | Bricolage |
| display-lg | 36px / 700 / -0.02em | Bricolage |
| h1 | 28px / 700 | Bricolage |
| h2 | 22px / 700 | Bricolage |
| h3 | 18px / 600 | Inter (or Bricolage 600) |
| body | 15px / 400 / lh 1.5 | Inter |
| body-sm | 13px / 400 | Inter |
| label | 12px / 600 / uppercase / tracking .08em / `--ink-subtle` | Inter |
| time | 11px / 500 / tabular-nums / `--ink-subtle` | Inter |

## Radius
`--r-sm 8px` (inputs) · `--r-md 12px` (buttons, pills-on-rect) · `--r-lg 16px` (cards) ·
`--r-xl 22px` (sheets, hero containers) · heatmap cell `5px` · `--r-full 999px` (pills, avatars).

## Elevation (soft + sparing — flat by default, elevate only floating surfaces)
- `--sh-xs 0 1px 2px rgba(50,40,10,.06)`
- `--sh-sm 0 4px 12px rgba(50,40,10,.08)` — resting cards
- `--sh-md 0 8px 24px rgba(50,40,10,.10)` — popovers / menus
- `--sh-lg 0 16px 40px rgba(50,40,10,.14)` — sheets / modals
- Heatmap cells = **flat, no shadow.**

## Motion (Family lesson: persist+transform; reserve delight)
- Easing `--ease-soft cubic-bezier(0.22, 1, 0.36, 1)` (gentle spring-out).
- Durations: `--t-fast 150ms` (hover/color), `--t-base 220ms` (enter/layout), `--t-slow 320ms` (sheets).
- Realtime heatmap updates: changed cells **fade + scale-in** (gentle), never hard-swap.
- **Confetti / delight = milestones only** (proposal locked, quorum met) — never on hover/decoration.
- Always honor `prefers-reduced-motion: reduce` (cut transforms, keep opacity fades ≤120ms).

## Heatmap rendering spec (the hero — get this right first)
- Container = `--surface-sunken`, `--r-lg`, ~12px pad. Empty cells = `--av-0` (warm), not white-in-a-box.
- Grid: gaps (~3–4px) + low-opacity warm lines (`--border`), **never** solid gray cell borders.
- Cells: `--r` 5px rounded fills, ~16–20px tall, free-count number centered.
- Time gutter: tabular-nums, `--ink-subtle`, right-aligned.
- "Everyone free" = `--av-5` + number; quorum = honey 2px inset outline; legend shows shape + label, not hue alone.
- Mobile-first: horizontal scroll for the 7-day × slot grid; consider a density/zoom toggle (Amie) later.
- Per-member identity colors are for *individual* availability views only; the *aggregate* heatmap uses
  the single green ramp (15 people must not become 15 clashing hues).

## Build order
1. Foundations: `globals.css` tokens + fonts (`layout.tsx`) + Tailwind `@theme` mapping.
2. Tokenize `src/lib/ui.ts` (btn/input/card/label → token classes; drop raw zinc/indigo).
3. In-app `/design` style-guide page (living reference; screenshot-reviewed).
4. The heatmap (hero) → group page → dashboard → proposals → onboarding/auth → landing → legal.
5. A11y pass per screen (contrast, focus, semantics, reduced-motion) + mobile @375px.
