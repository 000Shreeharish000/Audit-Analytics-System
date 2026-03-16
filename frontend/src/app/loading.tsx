export default function RootLoading() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div className="grid-overlay opacity-25" />
      <div className="noise-overlay opacity-60" />
      <section className="glass-surface relative z-10 w-full max-w-md rounded-[1.5rem] p-6 text-center">
        <p className="panel-title">Loading</p>
        <p className="mt-3 text-sm text-[color:var(--text-muted)]">Preparing enterprise decision intelligence workspace...</p>
        <div className="mx-auto mt-4 h-8 w-8 animate-spin rounded-full border-2 border-primary/70 border-t-transparent" />
      </section>
    </main>
  );
}
