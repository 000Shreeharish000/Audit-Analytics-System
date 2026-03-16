import { ReactNode } from "react";
import { TopBar } from "@/components/dashboard/top-bar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[var(--background)] overflow-x-hidden">
      <div className="flex min-h-screen">
        {/* Main content area */}
        <div className="flex w-full min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden px-4 pb-8 pt-4 md:px-8 xl:px-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
