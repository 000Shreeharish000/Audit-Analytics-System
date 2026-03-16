"use client";

import { motion } from "framer-motion";

const cards = [
  {
    title: "Ingest",
    body: "Pull events, actors, and controls into one live twin.",
    accent: "#7be0ff",
    illustration: <IngestVector />,
  },
  {
    title: "Trace",
    body: "Follow the exact risk path across approvals and payments.",
    accent: "#facc15",
    illustration: <TraceVector />,
  },
  {
    title: "Explain",
    body: "Turn findings into a report without leaving the workspace.",
    accent: "#8b5cf6",
    illustration: <ExplainVector />,
  },
];

function IngestVector() {
  return (
    <svg viewBox="0 0 320 220" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="ingest-line" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#7be0ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#4f6bff" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect x="16" y="20" width="92" height="180" rx="22" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" />
      <rect x="132" y="34" width="172" height="152" rx="26" fill="rgba(123,224,255,0.08)" stroke="rgba(123,224,255,0.22)" />
      {[52, 88, 124, 160].map((y, index) => (
        <g key={y}>
          <rect x="34" y={y} width="56" height="16" rx="8" fill="rgba(255,255,255,0.07)" />
          <circle cx="170" cy={58 + index * 32} r="13" fill="rgba(79,107,255,0.2)" stroke="#7be0ff" />
          <line x1="90" y1={y + 8} x2="157" y2={58 + index * 32} stroke="url(#ingest-line)" strokeWidth="2" strokeDasharray="4 6" />
        </g>
      ))}
      <circle cx="220" cy="84" r="15" fill="rgba(123,224,255,0.16)" stroke="#7be0ff" />
      <circle cx="254" cy="132" r="15" fill="rgba(123,224,255,0.12)" stroke="#7be0ff" />
      <circle cx="216" cy="146" r="10" fill="rgba(79,107,255,0.24)" stroke="#4f6bff" />
      <line x1="183" y1="70" x2="220" y2="84" stroke="url(#ingest-line)" strokeWidth="2" />
      <line x1="183" y1="102" x2="254" y2="132" stroke="url(#ingest-line)" strokeWidth="2" />
      <line x1="183" y1="134" x2="216" y2="146" stroke="url(#ingest-line)" strokeWidth="2" />
    </svg>
  );
}

function TraceVector() {
  return (
    <svg viewBox="0 0 320 220" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="trace-risk" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ff4d4f" />
        </linearGradient>
      </defs>
      {[38, 86, 134, 182].map((y) => (
        <line key={y} x1="26" y1={y} x2="294" y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="5 8" />
      ))}
      {[
        { x: 64, y: 38, tone: "#7be0ff" },
        { x: 112, y: 86, tone: "#60a5fa" },
        { x: 160, y: 134, tone: "#facc15" },
        { x: 206, y: 134, tone: "#facc15" },
        { x: 252, y: 182, tone: "#8b5cf6" },
        { x: 94, y: 182, tone: "#8b5cf6" },
      ].map((node) => (
        <circle key={`${node.x}-${node.y}`} cx={node.x} cy={node.y} r="12" fill={`${node.tone}18`} stroke={node.tone} />
      ))}
      <path d="M64 38 C84 50, 90 66, 112 86 S146 118, 160 134 S188 144, 206 134 S240 156, 252 182" fill="none" stroke="url(#trace-risk)" strokeWidth="4" strokeDasharray="8 7" strokeLinecap="round" />
      <path d="M64 38 C82 72, 72 118, 94 182" fill="none" stroke="rgba(123,224,255,0.34)" strokeWidth="2" />
      <path d="M112 86 C128 92, 144 108, 206 134" fill="none" stroke="rgba(123,224,255,0.22)" strokeWidth="2" />
    </svg>
  );
}

function ExplainVector() {
  return (
    <svg viewBox="0 0 320 220" className="h-full w-full" aria-hidden="true">
      <rect x="56" y="24" width="152" height="176" rx="24" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.14)" />
      <rect x="88" y="60" width="88" height="10" rx="5" fill="rgba(255,255,255,0.14)" />
      <rect x="88" y="82" width="62" height="10" rx="5" fill="rgba(255,255,255,0.08)" />
      <rect x="88" y="116" width="88" height="44" rx="14" fill="rgba(139,92,246,0.12)" stroke="rgba(139,92,246,0.36)" />
      <path d="M104 148 L124 128 L138 140 L160 118" fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="104" cy="148" r="4" fill="#8b5cf6" />
      <circle cx="124" cy="128" r="4" fill="#8b5cf6" />
      <circle cx="138" cy="140" r="4" fill="#8b5cf6" />
      <circle cx="160" cy="118" r="4" fill="#8b5cf6" />
      <rect x="224" y="66" width="48" height="48" rx="16" fill="rgba(123,224,255,0.1)" stroke="rgba(123,224,255,0.3)" />
      <rect x="224" y="126" width="48" height="48" rx="16" fill="rgba(250,204,21,0.1)" stroke="rgba(250,204,21,0.3)" />
      <path d="M208 92 H224" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeDasharray="4 6" />
      <path d="M208 150 H224" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeDasharray="4 6" />
      <path d="M239 88 H257 M248 79 V97" stroke="#7be0ff" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M236 150 H260" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ValueStrip() {
  return (
    <section id="platform-engines" className="mx-auto max-w-[1440px] px-6 pb-10 md:px-10 md:pb-14">
      <div className="glass-surface rounded-[2rem] px-6 py-7 md:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#9eb6ff]">See it fast</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Less reading. More signal.
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-[color:var(--text-muted)]">
            The platform is easiest to understand as a three-step flow: connect data, isolate the pathway, export the case.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {cards.map((card, index) => (
            <motion.article
              key={card.title}
              initial={{ opacity: 0.35, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: index * 0.06 }}
              className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.03]"
            >
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ boxShadow: `0 0 18px ${card.accent}`, backgroundColor: card.accent }}
                />
              </div>
              <div className="h-[210px] px-4 py-4">{card.illustration}</div>
              <p className="px-5 pb-5 text-sm leading-7 text-[color:var(--text-muted)]">{card.body}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
