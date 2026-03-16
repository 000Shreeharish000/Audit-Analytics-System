"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error boundary:", error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div className="grid-overlay opacity-25" />
      <div className="noise-overlay opacity-60" />
      <section className="glass-surface relative z-10 w-full max-w-lg rounded-[1.5rem] p-6">
        <p className="panel-title">Runtime Error</p>
        <h1 className="mt-3 text-2xl leading-tight">The page failed to load correctly.</h1>
        <p className="mt-3 text-sm text-[color:var(--text-muted)]">
          {error.message || "Unexpected failure while rendering this route."}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={reset}
            className="rounded-full border border-primary/45 bg-primary/20 px-4 py-2 text-xs font-semibold"
          >
            Retry Render
          </button>
          <Link href="/" className="rounded-full border border-border/70 bg-panel px-4 py-2 text-xs font-semibold">
            Back to Landing
          </Link>
        </div>
      </section>
    </main>
  );
}
