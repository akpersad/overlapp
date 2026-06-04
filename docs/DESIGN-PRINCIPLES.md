# Overlapp — Design Principles & Anti-Slop Guardrails

> Status: living doc · Created 2026-06-03 · Updated 2026-06-04
> Purpose: We deferred *visual* design until after Phase 1's data model and core loop. **That gate
> has now cleared — Phase 1 is built and working** (current UI is intentionally functional/minimal
> Tailwind), so a deliberate visual-design pass is unblocked whenever we choose to take it.
> This doc banks the principles so that when we design, we design deliberately —
> from references and intent — instead of accepting the model's statistically-average defaults.
>
> Source inspiration: "5 AI Website Design Tips for Distinctive Websites" (unpromptable.substack.com),
> reframed against Overlapp's actual product.

## The one rule

**Never let the model make a structural or visual decision by default.** Left alone, an AI
picks "the safest, most statistically average option" — and the result is the generic SaaS
skeleton: identical spacing scale, predictable section order (hero → 3 feature cards →
testimonial → pricing → CTA), and card grids seen on a thousand landing pages. Every layout
decision must trace back to a reference we chose or a structural sketch we drew.

## The five working habits

1. **Taste before prompting.** Before any UI work, collect 10–15 concrete references
   (Mobbin/Dribbble/Behance/Awwwards + real scheduling apps: When2Meet, Doodle, Howbout,
   Cal.com, Rallly). Note *what specifically* draws us in — whitespace, type, the heatmap
   rendering, motion. Prompts then reference the board, not adjectives.
2. **Start from polished assets, then make them ours.** Lean on vetted component primitives
   (e.g. shadcn/ui, 21st.dev, Radix) rather than generating bespoke components from zero —
   then re-skin to Overlapp's identity. Mirrors how real designers work.
3. **Build custom brand assets where stock doesn't fit.** The heatmap, the availability grid,
   the initials-avatar system, empty states — these are *the* product surface and deserve
   custom treatment, not a generic chart library look.
4. **Sketch before you prompt.** Wireframe each screen's structure (boxes + arrows + labels)
   before asking for code. The sketch fixes hierarchy and content flow so the model fills in
   styling, not decisions. Applies to: heatmap/week view, group dashboard, proposal flow,
   onboarding, invite preview.
5. **Iterate — first output is not final.** Treat each generated screen as a draft to
   interrogate: "make the mobile heatmap less cramped," "audit this for a11y and fix," "what
   belongs on the empty group state?"

## Overlapp-specific guardrails

- **Mobile-first, literally.** Design the phone layout first; desktop is the adaptation. The
  product is a PWA used on phones mid-conversation ("when can we meet?").
- **The heatmap is the hero, not a hero section.** The north-star artifact is the shared group
  calendar. The landing page should *show* it, and the in-app experience should make it the
  thing you land on — not bury it under chrome.
- **One confident accent, not a rainbow.** Availability has real semantic color needs
  (free / busy / quorum / proposed). Spend the color budget there; keep the rest of the UI
  restrained so the heatmap reads instantly.
- **Color must survive accessibility + colorblindness.** Free/busy/quorum cannot rely on hue
  alone — pair with value/pattern/label. This is a correctness requirement, not polish.
- **Privacy is visible design.** Members see free/busy, never event details. The UI should make
  that boundary obvious and reassuring — it's the trust that makes people sync a calendar.
- **Density without clutter.** A week × 30-min-slot grid for up to 15 people is dense. Solve
  legibility deliberately (zoom levels, week/range toggles, smart aggregation) — don't paper
  over it with whitespace.
- **No fake SaaS landing.** Only the landing page is public, and it sells one idea: "stop
  asking, just look." Resist the feature-card-triplet + testimonial + pricing template.

## Definition of "done well" for any screen

- It traces to a reference and/or a sketch we made — not a default.
- It works at 375px wide first.
- Availability states are distinguishable without color alone.
- It passes an a11y pass (contrast, focus, semantics, motion-reduce).
- It doesn't look interchangeable with a generic SaaS template.
