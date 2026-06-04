import { avatarColor, initials } from "@/lib/format";

// Initials avatar (spec: null avatar_url → first+last initials on a colour).
// Presentational + server-safe.
export function Avatar({
  firstName,
  lastName,
  avatarUrl,
  seed,
  size = 36,
  title,
}: {
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  seed: string;
  size?: number;
  title?: string;
}) {
  const dimension = { width: size, height: size, fontSize: size * 0.4 };

  if (avatarUrl) {
    // Avatar URLs are arbitrary user-provided origins; plain <img> avoids
    // configuring next/image remotePatterns for every possible host.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={title ?? "avatar"}
        title={title}
        style={dimension}
        className="rounded-full object-cover"
      />
    );
  }

  return (
    <span
      title={title}
      style={{ ...dimension, backgroundColor: avatarColor(seed) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
    >
      {initials(firstName, lastName)}
    </span>
  );
}
