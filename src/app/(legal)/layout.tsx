import Link from "next/link";

// Shared chrome for the public legal pages (/privacy, /terms). These are
// reachable signed-out (see proxy PUBLIC_PATHS) and linked from the landing
// footer. Route group → no URL segment. Kept deliberately plain (the visual
// design pass is Phase 7); readability is what matters for legal copy.
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
        <Link
          href="/"
          className="font-display text-lg font-extrabold tracking-tight text-honey-700"
        >
          Overlapp
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          ← Home
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <article className="flex flex-col gap-5 text-body leading-relaxed text-ink-muted">
          {children}
        </article>
      </main>

      <footer className="mx-auto flex w-full max-w-3xl items-center justify-center gap-4 px-4 py-8 text-xs text-ink-subtle">
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
      </footer>
    </div>
  );
}
