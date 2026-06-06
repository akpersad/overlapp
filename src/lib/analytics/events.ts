// The canonical set of product events we emit. Defined in one place so the names
// stay stable (renaming an event splits its history in PostHog) and so the
// weekly analysis has a known vocabulary to reason about — see docs/ANALYTICS.md.
//
// These map to the core loop in CLAUDE.md: signup → onboarding → create/join a
// group → set availability → connect a calendar → propose → lock a time. Each is
// a step in the activation funnel worth measuring.
//
// PRIVACY: event *names* and low-cardinality counts only — never group names,
// emails, event titles, or any free/busy detail. The product promise is
// free/busy-only; analytics holds to the same line.

export const EVENTS = {
  // Auth / activation
  SIGNED_UP: "signed_up",
  SIGNED_IN: "signed_in",
  ONBOARDING_COMPLETED: "onboarding_completed",

  // Groups + invites (the network-growth loop)
  GROUP_CREATED: "group_created",
  INVITE_CREATED: "invite_created",
  INVITE_REDEEMED: "invite_redeemed",

  // Availability (the data that powers the heatmap — the north star)
  BLOCK_ADDED: "block_added",
  CALENDAR_CONNECT_STARTED: "calendar_connect_started",

  // Proposals (the scheduling payoff)
  PROPOSAL_CREATED: "proposal_created",
  PROPOSAL_LOCKED: "proposal_locked",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
