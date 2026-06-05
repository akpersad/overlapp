// Shared presentational helpers for the legal pages so /privacy and /terms read
// consistently. Plain typography (the visual design pass is Phase 7).

export function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-display-lg text-ink">{children}</h1>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-4 text-h3 text-ink">{children}</h2>;
}

export function Updated({ date }: { date: string }) {
  return <p className="text-xs text-ink-subtle">Last updated {date}</p>;
}

// Contact address surfaced in both policies. TODO(pre-launch): confirm a real,
// monitored mailbox before going public (PRE-LAUNCH.md → legal pages).
export const CONTACT_EMAIL = "privacy@overlapp.app";
