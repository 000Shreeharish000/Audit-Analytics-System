from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4

import networkx as nx

from app.models.decision import AuditorAlert, AuditorAssignmentResult, CaseResult, DatasetPayload


class AuditorGuard:
    def _relationship_graph(self, dataset: DatasetPayload) -> nx.Graph:
        graph = nx.Graph()

        for employee in dataset.employees:
            graph.add_node(employee.employee_id)
            if employee.manager_id:
                graph.add_edge(employee.employee_id, employee.manager_id, relation_type="MANAGER")

        for vendor in dataset.vendors:
            graph.add_node(vendor.vendor_id)

        for relation in dataset.relationships:
            graph.add_edge(
                relation.source_id,
                relation.target_id,
                relation_type=relation.relation_type,
                confidence=relation.confidence,
            )
        return graph

    def _hops(self, graph: nx.Graph, source: str, target: str, max_hops: int) -> Optional[int]:
        if source not in graph.nodes or target not in graph.nodes:
            return None
        try:
            distance = nx.shortest_path_length(graph, source, target)
        except nx.NetworkXNoPath:
            return None
        if distance <= max_hops:
            return int(distance)
        return None

    def detect_favoritism_alerts(
        self,
        *,
        dataset: DatasetPayload,
        cases: List[CaseResult],
        company_id: str,
        max_hops: int,
    ) -> List[AuditorAlert]:
        relationship_graph = self._relationship_graph(dataset)
        auditors = {
            employee.employee_id
            for employee in dataset.employees
            if "auditor" in employee.role.lower()
        }
        if not auditors:
            return []

        invoice_vendor = {invoice.invoice_id: invoice.vendor_id for invoice in dataset.invoices}
        invoice_amount = {invoice.invoice_id: invoice.amount for invoice in dataset.invoices}
        approvals_by_auditor_vendor: Dict[tuple[str, str], Dict[str, float]] = defaultdict(
            lambda: {"count": 0, "amount": 0.0}
        )

        for approval in dataset.approvals:
            if approval.employee_id not in auditors:
                continue
            if approval.target_type == "invoice":
                vendor_id = invoice_vendor.get(approval.target_id)
                if not vendor_id:
                    continue
                key = (approval.employee_id, vendor_id)
                approvals_by_auditor_vendor[key]["count"] += 1
                approvals_by_auditor_vendor[key]["amount"] += invoice_amount.get(approval.target_id, 0.0)
            elif approval.target_type == "vendor":
                key = (approval.employee_id, approval.target_id)
                approvals_by_auditor_vendor[key]["count"] += 1

        alerts: List[AuditorAlert] = []
        for (auditor_id, vendor_id), stats in approvals_by_auditor_vendor.items():
            hops = self._hops(relationship_graph, auditor_id, vendor_id, max_hops)
            if hops is None:
                continue
            if stats["count"] < 2 and stats["amount"] < 300000:
                continue

            linked_case = next(
                (
                    case.case_id
                    for case in cases
                    if vendor_id in case.path_nodes
                ),
                None,
            )
            severity = min(1.0, 0.45 + (stats["count"] * 0.1) + ((max_hops - hops + 1) * 0.08))
            alerts.append(
                AuditorAlert(
                    alert_id=f"ALERT-{uuid4().hex[:10]}",
                    company_id=company_id,
                    auditor_id=auditor_id,
                    case_id=linked_case,
                    severity=round(severity, 2),
                    reason=(
                        f"Auditor {auditor_id} has repeated approvals tied to vendor {vendor_id} "
                        f"with social-connection path length {hops}."
                    ),
                    evidence={
                        "vendor_id": vendor_id,
                        "approval_count": int(stats["count"]),
                        "approved_amount": round(stats["amount"], 2),
                        "connection_hops": hops,
                    },
                    created_at=datetime.now(timezone.utc),
                )
            )
        return alerts

    def mark_admin_only_cases(self, cases: List[CaseResult], alerts: List[AuditorAlert]) -> List[CaseResult]:
        flagged_auditors = {alert.auditor_id for alert in alerts}
        flagged_case_ids = {alert.case_id for alert in alerts if alert.case_id}
        for case in cases:
            if case.case_id in flagged_case_ids or any(actor in flagged_auditors for actor in case.actors_involved):
                case.visibility = "admin_only"
        return cases

    def assign_best_auditor(
        self,
        *,
        dataset: DatasetPayload,
        company_id: str,
        vendor_id: str,
        max_hops: int,
        existing_assignments: List[AuditorAssignmentResult],
    ) -> AuditorAssignmentResult:
        relationship_graph = self._relationship_graph(dataset)
        auditors = [
            employee.employee_id
            for employee in dataset.employees
            if "auditor" in employee.role.lower()
        ]
        if not auditors:
            raise ValueError("No auditors available for assignment")

        workloads = defaultdict(int)
        for assignment in existing_assignments:
            workloads[assignment.auditor_id] += 1

        best = None
        best_score = float("inf")
        best_reason = ""
        for auditor_id in auditors:
            hops = self._hops(relationship_graph, auditor_id, vendor_id, max_hops)
            if hops is None:
                conflict_score = 0.05
                reason = "No detected social connection within guard radius."
            else:
                conflict_score = max(0.1, 1.0 / (hops + 1))
                reason = f"Connection path exists with {hops} hops."
            workload_penalty = workloads[auditor_id] * 0.05
            total_score = conflict_score + workload_penalty

            if total_score < best_score:
                best_score = total_score
                best = auditor_id
                best_reason = reason

        if best is None:
            raise ValueError("Unable to compute auditor assignment")
        return AuditorAssignmentResult(
            company_id=company_id,
            vendor_id=vendor_id,
            auditor_id=best,
            conflict_score=round(best_score, 2),
            assignment_reason=best_reason,
            assigned_at=datetime.now(timezone.utc),
        )
