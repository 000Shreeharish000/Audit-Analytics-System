"use client";

import { motion } from "framer-motion";
import { MoonStar, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useHasMounted } from "@/hooks/use-has-mounted";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();

  // Avoid hydration mismatch: render a placeholder until mounted
  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] transition-all"
      >
        <span className="h-4 w-4" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] transition-all hover:shadow-md"
    >
      <motion.span
        key={isDark ? "moon" : "sun"}
        initial={{ y: 8, opacity: 0, rotate: -15 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        exit={{ y: -8, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {isDark ? <MoonStar className="h-4 w-4 text-[var(--primary)]" /> : <Sun className="h-4 w-4 text-[var(--primary)]" />}
      </motion.span>
    </button>
  );
}
