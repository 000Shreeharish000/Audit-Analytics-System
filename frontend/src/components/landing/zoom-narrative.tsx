"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion } from "framer-motion";

const STEPS = [
  {
    id: "ingestion",
    title: "Data Ingestion",
    description: "Ingest enterprise records and validate transaction signatures before graph hydration.",
  },
  {
    id: "twin",
    title: "Digital Twin Construction",
    description: "Map employees, vendors, invoices, approvals, and payments into a structural graph model.",
  },
  {
    id: "reasoning",
    title: "Rule + Decision Reasoning",
    description: "Run governance constraints across chains, not isolated line items.",
  },
  {
    id: "pathway",
    title: "Bypass Pathway Detection",
    description: "Trace multi-hop control bypass routes with actor repetition and threshold evasions.",
  },
  {
    id: "investigation",
    title: "Investigation Output",
    description: "Generate explainable case files, confidence, and audit-ready recommendations.",
  },
];

export function ZoomNarrative() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (!sectionRef.current || !trackRef.current) {
      return;
    }

    const totalSlides = STEPS.length;
    const shiftPercent = (totalSlides - 1) * 100;

    const ctx = gsap.context(() => {
      const tween = gsap.to(trackRef.current, {
        xPercent: -shiftPercent,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: `+=${totalSlides * 700}`,
          pin: true,
          scrub: 1.05,
          onUpdate: (self) => {
            const index = Math.round(self.progress * (totalSlides - 1));
            setActiveStep(index);
          },
        },
      });
      return () => tween.kill();
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative h-screen overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-30" />
      <div className="absolute left-6 top-8 z-20 rounded-full border border-border/70 bg-surface/75 px-4 py-2 text-[11px] tracking-[0.16em] text-foreground/74 md:left-10">
        SCROLL INTELLIGENCE FLOW
      </div>

      <div ref={trackRef} className="flex h-full w-[500%]">
        {STEPS.map((step, index) => (
          <div key={step.id} className="relative flex h-full w-[20%] items-center justify-center px-6 md:px-10">
            <div className="grid w-full max-w-[1280px] grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_0.95fr]">
              <motion.div
                initial={{ opacity: 0.35, y: 24 }}
                animate={{ opacity: index === activeStep ? 1 : 0.45, y: index === activeStep ? 0 : 8 }}
                transition={{ duration: 0.35 }}
                className="space-y-5"
              >
                <p className="panel-title">Step {String(index + 1).padStart(2, "0")}</p>
                <h2 className="max-w-xl text-4xl leading-tight md:text-6xl">{step.title}</h2>
                <p className="max-w-xl text-base text-foreground/72 md:text-lg">{step.description}</p>
              </motion.div>

              <div className="relative">
                <div className="glass-surface relative h-[380px] overflow-hidden rounded-[30px] border border-border/80">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/16 via-transparent to-amber-400/10" />
                  <motion.div
                    animate={{ rotate: index * 42, scale: index === activeStep ? 1.03 : 0.94 }}
                    transition={{ duration: 0.55 }}
                    className="absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/35"
                  />
                  <motion.div
                    animate={{
                      rotate: -index * 32,
                      scale: index === activeStep ? 1 : 0.9,
                    }}
                    transition={{ duration: 0.55 }}
                    className="absolute left-1/2 top-1/2 h-[155px] w-[155px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/80 bg-surface/72"
                  />
                  <motion.div
                    animate={{ opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_18px_rgba(53,185,239,0.5)]"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
        <div className="glass-surface rounded-full px-4 py-2 text-xs text-foreground/75">
          {activeStep + 1}/{STEPS.length} | Scroll to inspect pipeline
        </div>
      </div>
    </section>
  );
}

