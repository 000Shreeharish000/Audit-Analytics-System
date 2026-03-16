"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Filter,
  GitBranch,
  Play,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { CyberGraph } from "@/components/graph/cyber-graph";
import { getVendorSubgraph, searchVendors } from "@/lib/api";
import { VendorSearchResult, VendorSubgraphResponse } from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";

interface GraphFilter {
  vendorId: string | null;
  employeeId: string | null;
  ruleId: string | null;
  riskLevel: string | null;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "#00b894",
  MEDIUM: "#f39c12",
  HIGH: "#e17055",
  CRITICAL: "#e74c3c",
};

function FilterChip({ label, color, onRemove }: { label: string; color: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: `${color}20`, color }}>
      {label}
      <button onClick={onRemove} className="ml-0.5 rounded-full hover:opacity-70 transition-opacity">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function VendorGraphWorkspace() {
  const graph = useDashboardStore((s) => s.graph);
  const cases = useDashboardStore((s) => s.cases);
  const token = useDashboardStore((s) => s.token);

  const [filters, setFilters] = useState<GraphFilter>({
    vendorId: null,
    employeeId: null,
    ruleId: null,
    riskLevel: null,
  });
  const [graphBuilt, setGraphBuilt] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [vendorResults, setVendorResults] = useState<VendorSearchResult[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<VendorSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [subgraph, setSubgraph] = useState<VendorSubgraphResponse | null>(null);
  const [subgraphLoading, setSubgraphLoading] = useState(false);
  const [subgraphError, setSubgraphError] = useState<string | null>(null);

  /* ─── Derived lists from graph ─── */
  const vendors = useMemo(() => {
    if (!graph?.nodes) return [];
    return graph.nodes
      .filter((n) => n.type?.toLowerCase().includes("vendor"))
      .map((n) => ({ id: n.id as string, label: (n.label ?? n.id) as string }))
      .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
  }, [graph]);

  const employees = useMemo(() => {
    if (!graph?.nodes) return [];
    return graph.nodes
      .filter((n) => {
        const t = n.type?.toLowerCase() ?? "";
        return t.includes("employee") || t.includes("emp");
      })
      .map((n) => ({ id: n.id as string, label: (n.label ?? n.id) as string }))
      .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i)
      .slice(0, 30);
  }, [graph]);

  const allRules = useMemo(() => {
    const ruleSet = new Set<string>();
    for (const c of cases) for (const r of c.rules_triggered) ruleSet.add(r);
    return [...ruleSet];
  }, [cases]);

  const activeFiltersCount =
    (filters.vendorId ? 1 : 0) +
    (filters.employeeId ? 1 : 0) +
    (filters.ruleId ? 1 : 0) +
    (filters.riskLevel ? 1 : 0);

  const hasFilter = activeFiltersCount > 0;
  const canBuildGraph = Boolean(filters.vendorId) && Boolean(token);
  const matchedCases = graphBuilt ? subgraph?.matched_cases ?? [] : [];
  const summary = subgraph?.summary ?? null;
  const initialize = useDashboardStore((s) => s.initialize);
  const openInvestigation = useDashboardStore((s) => s.openInvestigation);

  useEffect(() => {
    if (!graph && token) {
      void initialize();
    }
  }, [graph, token, initialize]);

  useEffect(() => {
    if (!token || !search.trim() || filters.vendorId) {
      setVendorResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const response = await searchVendors(token, search.trim(), 8);
        setVendorResults(response.results);
      } catch (error) {
        setSearchError(error instanceof Error ? error.message : "Unable to search vendors.");
        setVendorResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [filters.vendorId, search, token]);

  const handleBuildGraph = useCallback(async () => {
    if (!token || !filters.vendorId) {
      return;
    }
    setSubgraphLoading(true);
    setSubgraphError(null);
    try {
      const response = await getVendorSubgraph(token, filters.vendorId, {
        employeeId: filters.employeeId,
        ruleId: filters.ruleId,
        riskLevel: filters.riskLevel,
      });
      setSubgraph(response);
      setGraphBuilt(true);
      if (!selectedVendor) {
        setSelectedVendor({
          vendor_id: response.summary.vendor_id,
          name: response.summary.vendor_name,
          created_by: response.summary.created_by,
          approved_by: response.summary.approved_by,
          invoice_count: response.summary.invoice_count,
          payment_count: response.summary.payment_count,
          total_invoice_amount: response.summary.total_invoice_amount,
          total_payment_amount: response.summary.total_payment_amount,
          matching_case_count: response.summary.case_count,
          highest_risk: response.summary.highest_risk,
        });
      }
    } catch (error) {
      setSubgraphError(error instanceof Error ? error.message : "Unable to build vendor graph.");
    } finally {
      setSubgraphLoading(false);
    }
  }, [filters.employeeId, filters.riskLevel, filters.ruleId, filters.vendorId, selectedVendor, token]);

  const handleReset = () => {
    setFilters({ vendorId: null, employeeId: null, ruleId: null, riskLevel: null });
    setGraphBuilt(false);
    setSearch("");
    setShowAdvancedFilters(false);
    setVendorResults([]);
    setSelectedVendor(null);
    setSubgraph(null);
    setSearchError(null);
    setSubgraphError(null);
  };

  return (
    <div className="custom-scrollbar flex h-full min-h-0 flex-col gap-3 overflow-y-auto overflow-x-hidden bg-[var(--card-bg)] p-4">
      <section className="shrink-0 rounded-[28px] border border-[var(--card-border)]/70 bg-[var(--background)]/70 px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
                <GitBranch className="h-3.5 w-3.5" />
                Investigation graph workspace
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--foreground)]">Build a simpler, focused relationship view</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Start with a vendor, then add optional filters only if you need them. This keeps the graph easier to scan and better for demos.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[320px]">
              {[
                { label: "Vendors", value: vendors.length },
                { label: "Employees", value: employees.length },
                { label: "Rules", value: allRules.length },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative">
              <div className="flex items-center gap-3 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3 shadow-sm">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search by vendor name or vendor ID"
                  value={filters.vendorId ? selectedVendor?.name ?? filters.vendorId : search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (filters.vendorId) {
                      setFilters((f) => ({ ...f, vendorId: null }));
                      setSelectedVendor(null);
                      setGraphBuilt(false);
                      setSubgraph(null);
                    }
                  }}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
                />
              </div>

              {searchLoading && !filters.vendorId ? (
                <div className="absolute left-0 top-full z-50 mt-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-xs text-[var(--text-muted)] shadow-xl">
                  Searching vendors...
                </div>
              ) : null}

              {search && !filters.vendorId && vendorResults.length > 0 && (
                <div className="absolute left-0 top-full z-50 mt-2 max-h-56 w-full overflow-y-auto rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-2 shadow-2xl">
                  {vendorResults.map((vendor) => (
                    <button
                      key={vendor.vendor_id}
                      onClick={() => {
                        setFilters((f) => ({ ...f, vendorId: vendor.vendor_id }));
                        setSelectedVendor(vendor);
                        setGraphBuilt(false);
                        setSubgraph(null);
                        setSubgraphError(null);
                        setSearch("");
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-[var(--primary)]/8"
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-[#7be0ff]" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-[var(--foreground)]">{vendor.name}</p>
                          {vendor.highest_risk ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                              style={{
                                backgroundColor: `${RISK_COLORS[vendor.highest_risk] ?? "#6c5ce7"}16`,
                                color: RISK_COLORS[vendor.highest_risk] ?? "#6c5ce7",
                              }}
                            >
                              {vendor.highest_risk}
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">
                          {vendor.vendor_id} · {vendor.matching_case_count} case{vendor.matching_case_count !== 1 ? "s" : ""} · {vendor.invoice_count} invoices
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchError && !filters.vendorId ? (
                <div className="absolute left-0 top-full z-50 mt-2 rounded-2xl border border-[var(--danger)]/20 bg-[var(--card-bg)] px-3 py-2 text-xs text-[var(--danger)] shadow-xl">
                  {searchError}
                </div>
              ) : null}


            </div>

            <button
              onClick={() => setShowAdvancedFilters((value) => !value)}
              className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--background)]"
            >
              <Filter className="h-4 w-4 text-[var(--text-muted)]" />
              More filters
              <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${showAdvancedFilters ? "rotate-180" : ""}`} />
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBuildGraph}
                disabled={!canBuildGraph || subgraphLoading}
                className={`inline-flex items-center gap-2 rounded-[22px] px-4 py-3 text-sm font-semibold transition-all ${
                  canBuildGraph && !subgraphLoading
                    ? "bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white shadow-lg shadow-[#6c5ce7]/20 hover:shadow-xl"
                    : "cursor-not-allowed bg-[var(--card-border)] text-[var(--text-muted)]"
                }`}
              >
                <Play className="h-4 w-4" />
                {subgraphLoading ? "Building..." : graphBuilt ? "Refresh view" : "Open graph"}
              </button>

              {graphBuilt && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-[22px] border border-[var(--card-border)] px-4 py-3 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </button>
              )}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showAdvancedFilters ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="grid gap-3 overflow-hidden md:grid-cols-3"
              >
                <select
                  value={filters.employeeId ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, employeeId: e.target.value || null }))}
                  className="rounded-[18px] border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-3 text-sm outline-none"
                >
                  <option value="">All employees</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.label}</option>
                  ))}
                </select>

                <select
                  value={filters.ruleId ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, ruleId: e.target.value || null }))}
                  className="rounded-[18px] border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-3 text-sm outline-none"
                >
                  <option value="">All rules</option>
                  {allRules.map((rule) => (
                    <option key={rule} value={rule}>{rule.replace("RULE_", "").replaceAll("_", " ")}</option>
                  ))}
                </select>

                <select
                  value={filters.riskLevel ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, riskLevel: e.target.value || null }))}
                  className="rounded-[18px] border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-3 text-sm outline-none"
                >
                  <option value="">All risk levels</option>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((riskLevel) => (
                    <option key={riskLevel} value={riskLevel}>{riskLevel}</option>
                  ))}
                </select>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {hasFilter ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-[var(--card-border)]/70 bg-[var(--card-bg)]/70 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Active view</span>
              {filters.vendorId && (
                <FilterChip
                  label={`Vendor: ${selectedVendor?.name ?? filters.vendorId}`}
                  color="#7be0ff"
                  onRemove={() => {
                    setFilters((f) => ({ ...f, vendorId: null }));
                    setSelectedVendor(null);
                    setGraphBuilt(false);
                    setSubgraph(null);
                  }}
                />
              )}
              {filters.employeeId && (
                <FilterChip
                  label={`Employee: ${employees.find((employee) => employee.id === filters.employeeId)?.label ?? filters.employeeId}`}
                  color="#4f6bff"
                  onRemove={() => setFilters((f) => ({ ...f, employeeId: null }))}
                />
              )}
              {filters.ruleId && (
                <FilterChip
                  label={`Rule: ${filters.ruleId.replace("RULE_", "").replaceAll("_", " ")}`}
                  color="#f39c12"
                  onRemove={() => setFilters((f) => ({ ...f, ruleId: null }))}
                />
              )}
              {filters.riskLevel && (
                <FilterChip
                  label={`Risk: ${filters.riskLevel}`}
                  color={RISK_COLORS[filters.riskLevel] ?? "#6c5ce7"}
                  onRemove={() => setFilters((f) => ({ ...f, riskLevel: null }))}
                />
              )}
              {graphBuilt && (
                <span className="ml-auto text-[11px] font-semibold text-[#00b894]">
                  {matchedCases.length} matched case{matchedCases.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          ) : null}

          {subgraphError ? (
            <div className="rounded-[20px] border border-[var(--danger)]/20 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
              {subgraphError}
            </div>
          ) : null}
        </div>
      </section>

      <div className="relative min-h-[620px] flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {!graphBuilt ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full min-h-[520px] flex-col items-center justify-center rounded-[30px] border border-dashed border-[var(--card-border)] bg-[linear-gradient(180deg,var(--card-bg),var(--background))] px-6 text-center"
            >
              <div className="relative mb-6 flex items-center gap-6">
                {["Vendor", "Invoice", "Payment"].map((label, index) => (
                  <motion.div
                    key={label}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 3, delay: index * 0.25, repeat: Infinity, ease: "easeInOut" }}
                    className="flex flex-col items-center gap-2"
                  >
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border text-[11px] font-bold shadow-sm"
                      style={{
                        borderColor: ["#7be0ff", "#facc15", "#8b5cf6"][index],
                        color: ["#7be0ff", "#facc15", "#8b5cf6"][index],
                        background: `${["#7be0ff", "#facc15", "#8b5cf6"][index]}10`,
                      }}
                    >
                      {label[0]}
                    </div>
                    <span className="text-[10px] font-semibold text-[var(--text-muted)]">{label}</span>
                  </motion.div>
                ))}
              </div>
              <p className="text-lg font-semibold tracking-tight text-[var(--foreground)]">Choose a slice of the network to explore</p>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--text-muted)]">
                Pick a vendor first, then optionally narrow by employee, rule, or risk level. The graph will stay cleaner and easier to explain.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="graph"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45 }}
              className="flex h-full min-h-[780px] flex-col overflow-hidden rounded-[30px] border border-[var(--card-border)]/70 bg-[var(--background)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] px-5 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Focused graph</p>
                  <h4 className="mt-1 text-base font-semibold text-[var(--foreground)]">{summary?.vendor_name ?? selectedVendor?.name ?? "Filtered relationship map"}</h4>
                  <p className="text-xs text-[var(--text-muted)]">A simplified view designed to be easier to read in demos and reviews.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[var(--text-muted)]">
                  {summary ? <span className="rounded-full bg-[var(--primary)]/8 px-3 py-1 text-[var(--primary)]">{summary.vendor_id}</span> : null}
                  <span className="rounded-full bg-[#00b894]/10 px-3 py-1 text-[#00b894]">{matchedCases.length} matched case{matchedCases.length !== 1 ? "s" : ""}</span>
                  {summary?.highest_risk ? (
                    <span
                      className="rounded-full px-3 py-1"
                      style={{
                        backgroundColor: `${RISK_COLORS[summary.highest_risk] ?? "#6c5ce7"}16`,
                        color: RISK_COLORS[summary.highest_risk] ?? "#6c5ce7",
                      }}
                    >
                      {summary.highest_risk} risk
                    </span>
                  ) : null}
                </div>
              </div>

              {summary ? (
                <div className="grid gap-2 border-b border-[var(--card-border)] px-5 py-3 md:grid-cols-4">
                  {[
                    { label: "Invoices", value: summary.invoice_count },
                    { label: "Payments", value: summary.payment_count },
                    { label: "Approvals", value: summary.approval_count },
                    { label: "Employees in scope", value: summary.employees_in_scope },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl bg-[var(--card-bg)] px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="relative min-h-[520px] flex-1 overflow-hidden">
                {!subgraphLoading && subgraph?.graph ? (
                  <CyberGraph
                    graphData={subgraph.graph}
                    activeCaseId={matchedCases?.[0]?.case_id}
                    matchedCases={matchedCases}
                    onOpenInvestigation={openInvestigation}
                  />
                ) : (
                  <div className="flex h-full min-h-[620px] flex-col items-center justify-center bg-[var(--background)] text-sm text-[var(--text-muted)]">
                    {subgraphLoading ? (
                      <div className="flex items-center gap-3">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                        Building focused network graph...
                      </div>
                    ) : (
                      "Select a vendor and build the graph to load the focused subgraph."
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
