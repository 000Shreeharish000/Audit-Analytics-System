"use client";

import Link from "next/link";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { GraphPreview } from "@/components/landing/graph-preview";
import { Hero, LandingSceneBackdrop } from "@/components/landing/hero";
import { PlatformInterfacePreview } from "@/components/landing/platform-interface-preview";
import { ValueStrip } from "@/components/landing/value-strip";

const proofPoints = ["Live graph twin", "Auditor workspace", "Report export"];

export default function LandingPage() {
  const { setTheme } = useTheme();

  useEffect(() => {
    const previousTheme = window.localStorage.getItem("theme");
    setTheme("dark");

    return () => {
      if (previousTheme === "light" || previousTheme === "dark" || previousTheme === "system") {
        setTheme(previousTheme);
        return;
      }

      setTheme("system");
    };
  }, [setTheme]);

  return (
    <main className="relative overflow-hidden">
      <LandingSceneBackdrop />
      <div className="relative z-10">
        <Hero />
        <ValueStrip />
        <GraphPreview />
        <PlatformInterfacePreview />
        <section className="mx-auto max-w-[1440px] px-6 pb-12 md:px-10 md:pb-16">
          <motion.div
            initial={{ opacity: 0.45, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="glass-surface flex flex-col gap-6 rounded-[2rem] px-6 py-8 md:flex-row md:items-center md:justify-between md:px-8"
          >
            <div className="max-w-2xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8ef0ff]">Ready to inspect</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                Open the platform and move straight into the graph.
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {proofPoints.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] px-7 py-3.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-[#6c5ce7]/25 transition-all duration-200 hover:shadow-xl hover:shadow-[#6c5ce7]/35 hover:brightness-110"
            >
              Open Dashboard
            </Link>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
