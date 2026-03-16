"use client";

import { ReactNode } from "react";
import { RuntimeGuard } from "@/components/common/runtime-guard";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <RuntimeGuard>
      <div className="min-h-screen">
        {children}
      </div>
    </RuntimeGuard>
  );
}
