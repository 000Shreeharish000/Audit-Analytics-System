export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-8">
      <div className="glass-surface rounded-2xl px-6 py-4 text-sm text-[color:var(--text-muted)]">
        Restoring dashboard state...
      </div>
    </div>
  );
}
