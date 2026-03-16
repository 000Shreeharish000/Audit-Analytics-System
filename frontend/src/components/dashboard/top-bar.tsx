"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, LogOut, Shield, User, Bot, Sparkles, Send, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { ExportReportButton } from "@/components/dashboard/export-report-button";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { useDashboardStore } from "@/store/dashboard-store";

export function TopBar() {
  const router = useRouter();
  const role = useDashboardStore((state) => state.role);
  const userName = useDashboardStore((state) => state.userName);
  const status = useDashboardStore((state) => state.status);
  const logout = useDashboardStore((state) => state.logout);

  const setActiveAdminSection = useDashboardStore((state) => state.setActiveAdminSection);
  const setActiveAuditorSection = useDashboardStore((state) => state.setActiveAuditorSection);

  const mounted = useHasMounted();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [chatHistory, setChatHistory] = useState<{role: "user" | "ai", text: string, action?: { label: string, onClick: () => void }}[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isTyping]);

  const handleAiSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;

    const query = searchValue.trim();
    setSearchValue("");
    setSearchFocused(true);
    
    setChatHistory(prev => [...prev, { role: "user", text: query }]);
    setIsTyping(true);

    setTimeout(() => {
      let aiResponse = "I can help you navigate the Decision Twin environment or query specific data.";
      let action: { label: string, onClick: () => void } | undefined;

      const q = query.toLowerCase();
      
      if (q.includes("inference") || q.includes("v300") || q.includes("investigation")) {
        aiResponse = "I found inferences and high-risk case paths related to your query. You can view the graph progression and risk explanation in the Investigation tab.";
        action = {
          label: "Go to Investigation",
          onClick: () => {
            if (role === "admin") setActiveAdminSection("investigation");
            else setActiveAuditorSection("investigation");
            setSearchFocused(false);
          }
        };
      } else if (q.includes("report") || q.includes("export") || q.includes("writer")) {
        if (role === "auditor") {
          aiResponse = "You can document findings and export PDF reports using the Auditor Report Writer.";
          action = {
            label: "Open Report Writer",
            onClick: () => {
              setActiveAuditorSection("report");
              setSearchFocused(false);
            }
          };
        } else {
          aiResponse = "The Report Writer is only available to Auditor roles. As an admin, you can view the Overview or graph Telemetry.";
          action = {
            label: "View Telemetry",
            onClick: () => {
              setActiveAdminSection("telemetry");
              setSearchFocused(false);
            }
          };
        }
      } else if (q.includes("pipeline") || q.includes("flow")) {
        if (role === "auditor") {
          aiResponse = "I can take you to the Pipeline Explorer to see the visual SVG flow of events.";
          action = {
            label: "Open Pipeline Explorer",
            onClick: () => {
              setActiveAuditorSection("pipeline");
              setSearchFocused(false);
            }
          };
        }
      } else if (q.includes("compliance") || q.includes("rule")) {
        aiResponse = "Compliance rules in this environment enforce logic such as the 'RAPID_APPROVAL_CHAIN' limit. Any multi-tier bypassing triggers an automatic audit anomaly flag in the graph telemetry.";
      } else if (q.includes("risk") || q.includes("anomaly")) {
        aiResponse = "Currently, there are detected risks categorized as HIGH or CRITICAL depending on financial exposure limits over 1M. You can navigate to Investigation to trace these paths.";
        action = {
          label: "View Investigation",
          onClick: () => {
            if (role === "admin") setActiveAdminSection("investigation");
            else setActiveAuditorSection("investigation");
            setSearchFocused(false);
          }
        };
      } else if (q.includes("hi") || q.includes("hello")) {
         aiResponse = `Hello! How can I assist you in navigating the ${role === "admin" ? "Admin" : "Auditor"} environment today?`;
      } else {
         aiResponse = "I can help you navigate the Decision Twin environment, trace anomalies, export audit reports, or query compliance status. Please provide a more specific instruction.";
      }

      setChatHistory(prev => [...prev, { role: "ai", text: aiResponse, action }]);
      setIsTyping(false);
    }, 800);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!mounted) {
    return (
      <header className="z-40 mx-5 mt-4 md:mx-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] shadow-lg shadow-[#6c5ce7]/20">
              <Shield className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight">Decision Twin</p>
              <p className="text-[11px] text-[var(--text-muted)]">Loading workspace...</p>
            </div>
          </div>

          <div className="hidden flex-1 justify-center md:flex">
            <div className="h-11 w-full max-w-[500px] rounded-full border border-[var(--card-border)] bg-[var(--card-bg)]" />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="h-8 w-20 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)]" />
            <div className="h-10 w-28 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]" />
            <div className="h-10 w-10 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]" />
            <div className="h-10 w-10 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]" />
            <div className="h-10 w-24 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="z-40 mx-5 mt-4 md:mx-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Logo & Identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe] shadow-lg shadow-[#6c5ce7]/20">
            <Shield className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight">Decision Twin</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {role === "admin" ? "Admin Console" : "Auditor Console"}
            </p>
          </div>
        </div>

        {/* Center: AI Search / Navigator */}
        <div ref={searchRef} className="hidden flex-1 justify-center md:flex relative">
          <div className="relative w-full max-w-[500px]">
            <Bot className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--primary)]" />
            <form onSubmit={handleAiSearch}>
              <input
                type="text"
                placeholder="Ask AI to navigate or analyze data..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="w-full rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] pl-10 pr-12 py-2.5 text-sm outline-none transition-all placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]/40 focus:shadow-[0_0_0_3px_rgba(108,92,231,0.15)] focus:bg-[var(--background)]"
              />
              <button 
                type="submit" 
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            <AnimatePresence>
              {searchFocused && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl shadow-[var(--primary)]/5"
                >
                  <div className="flex items-center gap-2 border-b border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5">
                    <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                    <span className="text-xs font-bold text-[var(--primary)]">Decision Twin AI Navigator</span>
                  </div>
                  
                  <div className="custom-scrollbar flex max-h-[350px] flex-col gap-3 overflow-y-auto p-4 bg-white/50 dark:bg-black/20">
                    {chatHistory.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center text-center text-[var(--text-muted)] opacity-70">
                        <Bot className="mb-2 h-8 w-8" />
                        <p className="text-xs">Try asking: Where is the inference for V300?</p>
                      </div>
                    ) : (
                      chatHistory.map((msg, i) => (
                        <div key={i} className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                            msg.role === "user" 
                              ? "bg-[var(--primary)] text-white relative rounded-tr-sm" 
                              : "bg-[var(--background)] border border-[var(--card-border)] text-[var(--foreground)] relative rounded-tl-sm"
                          }`}>
                            <p className="text-xs leading-relaxed">{msg.text}</p>
                            {msg.action && (
                              <button 
                                onClick={(e) => { e.preventDefault(); msg.action!.onClick(); }}
                                className="mt-3 flex w-full items-center justify-between rounded-xl bg-white/5 border border-black/10 dark:border-white/10 px-3 py-2 text-[11px] font-bold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                              >
                                {msg.action.label}
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {isTyping && (
                      <div className="flex w-full justify-start">
                        <div className="max-w-[85%] rounded-2xl bg-[var(--background)] border border-[var(--card-border)] relative rounded-tl-sm px-4 py-3">
                          <span className="flex gap-1">
                            <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0 }} className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
                            <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.2 }} className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
                            <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.4 }} className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
                          </span>
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Status indicator */}
          <span className="status-pill">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00b894] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00b894]" />
            </span>
            {status === "loading" ? "Syncing" : "Live"}
          </span>

          <ExportReportButton className="pro-button" />

          <div ref={dropdownRef} className="relative">
            <button 
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] transition-all hover:shadow-md active:scale-95"
            >
              <Bell className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] bg-[#e74c3c]" />
            </button>
            <AnimatePresence>
              {notificationsOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 top-full z-50 mt-3 isolate w-80 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(5,10,24,0.28)]"
                >
                  <div className="border-b border-[var(--card-border)] bg-[var(--surface)] px-4 py-3">
                    <p className="text-sm font-bold">Notifications</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Live system alerts</p>
                  </div>
                  <div className="custom-scrollbar max-h-72 overflow-y-auto bg-[var(--surface)] p-2">
                    {[
                      { title: "Anomaly Detected", desc: "Rule violation in invoice #V9384", time: "2m ago", color: "text-[#e74c3c]", bg: "bg-[#e74c3c]", event_type: "anomaly" },
                      { title: "Graph Sync Ready", desc: "Digital twin graph synchronized successfully", time: "14m ago", color: "text-[#00b894]", bg: "bg-[#00b894]", event_type: "sync" },
                      { title: "Admin Login", desc: "New secure session from authorized host", time: "41m ago", color: "text-[#6c5ce7]", bg: "bg-[#6c5ce7]", event_type: "admin login" },
                    ].filter(n => role === "admin" || !n.event_type.toLowerCase().includes("admin login")).map((n, i) => (
                      <div
                        key={i}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-transparent bg-transparent p-3 transition-colors hover:border-[var(--card-border)] hover:bg-[var(--panel)]"
                      >
                        <div className={`mt-1 h-2 w-2 rounded-full ${n.bg} shrink-0 shadow-sm`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold ${n.color}`}>{n.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">{n.desc}</p>
                          <p className="mt-1 text-[10px] text-[var(--text-muted)]">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <ThemeToggle />

          {/* User avatar */}
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#6c5ce7] to-[#a29bfe]">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold">{userName ?? (role === "admin" ? "Admin" : "Auditor")}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{role}</p>
            </div>
          </div>

          <button
            onClick={() => { logout(); router.push("/login"); }}
            className="pro-button text-[var(--danger)] hover:bg-[var(--danger)]/8"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
