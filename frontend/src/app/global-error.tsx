"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
          <div className="grid-overlay opacity-25" />
          <div className="noise-overlay opacity-60" />
          <section className="glass-surface relative z-10 w-full max-w-lg rounded-[1.5rem] p-6">
            <p className="panel-title">Global Error</p>
            <h1 className="mt-3 text-2xl leading-tight">The application encountered a fatal rendering error.</h1>
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              {error.message || "Unexpected failure while rendering application shell."}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                onClick={reset}
                className="rounded-full border border-primary/45 bg-primary/20 px-4 py-2 text-xs font-semibold"
              >
                Retry App
              </button>
              <Link href="/" className="rounded-full border border-border/70 bg-panel px-4 py-2 text-xs font-semibold">
                Open Landing
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
