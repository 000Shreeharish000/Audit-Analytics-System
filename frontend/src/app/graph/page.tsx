"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CyberGraph } from "@/components/graph/cyber-graph";
import { useDashboardStore } from "@/store/dashboard-store";
import { useHasMounted } from "@/hooks/use-has-mounted";

export default function GraphPage({ searchParams }: { searchParams: { caseId?: string } }) {
  const router = useRouter();
  const mounted = useHasMounted();
  const status = useDashboardStore((state) => state.status);
  const graph = useDashboardStore((state) => state.graph);
  const cases = useDashboardStore((state) => state.cases);
  const initialize = useDashboardStore((state) => state.initialize);

  const activeCaseId = searchParams?.caseId || null;

  useEffect(() => {
    if (status === "idle") void initialize();
  }, [status, initialize]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (!mounted) return null;

  if (status === "loading" && !graph) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-[var(--text-muted)] animate-pulse">Loading graph data...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] w-full flex-col p-4 animate-fade-in">
      <div className="flex-1 w-full overflow-hidden rounded-[30px] shadow-2xl border border-[var(--card-border)] bg-[#0b1121]">
        <CyberGraph
          graphData={graph}
          activeCaseId={activeCaseId}
          matchedCases={cases}
        />
      </div>
    </div>
  );
}
