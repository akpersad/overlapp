// Pure presentation helpers (unit-tested). No I/O — safe in both server and
// client components.

type NameParts = {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** First+last initials for the default avatar (spec §User data). "?" fallback. */
export function initials(first?: string | null, last?: string | null): string {
  const a = (first ?? "").trim().charAt(0);
  const b = (last ?? "").trim().charAt(0);
  const result = (a + b).toUpperCase();
  return result || "?";
}

/** Display name: explicit display_name, else "First L." (spec §User data). */
export function displayName(p: NameParts): string {
  const explicit = p.display_name?.trim();
  if (explicit) return explicit;
  const f = (p.first_name ?? "").trim();
  const l = (p.last_name ?? "").trim();
  if (f && l) return `${f} ${l.charAt(0).toUpperCase()}.`;
  return f || "Member";
}

/** Deterministic avatar background colour from a seed (e.g. the user id). */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  // Mid-saturation, mid-lightness so white initials stay legible.
  return `hsl(${hash} 55% 42%)`;
}
