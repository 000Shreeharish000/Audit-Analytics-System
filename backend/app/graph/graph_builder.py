from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable
from uuid import uuid4

import networkx as nx

from app.models.decision import CaseResult, DatasetPayload, Decision, RuleResult


class DigitalTwinGraphBuilder:
    def __init__(self, graph: nx.MultiDiGraph) -> None:
        self.graph = graph

    def reset(self) -> None:
        self.graph.clear()

    def _add_edge(self, source: str, target: str, relation: str) -> None:
        self.graph.add_edge(
            source,
            target,
            key=f"{relation}:{uuid4().hex[:8]}",
            type=relation,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def _safe_add_node(self, node_id: str, node_type: str = None, **attrs: object) -> None:
        # grPH uses 'node_type' directly in kwargs or expects it to be node_type, not 'type'
        payload = {"node_type": node_type} if node_type else {}
        if "type" in attrs:
            # Fallback for older code
            payload["node_type"] = attrs.pop("type")
        payload.update(attrs)
        self.graph.add_node(node_id, **payload)

    def build_from_dataset(self, dataset: DatasetPayload) -> None:
        self.reset()
        
        # Policy & Roles
        self._safe_add_node(
            "policy_runtime",
            node_type="policy",
            name="Live Policy Runtime",
            invoice_approval_threshold=10000,
            large_payment_threshold=50000,
            rapid_payment_max_days=2,
            dormancy_threshold_days=90,
        )

        role_nodes = {
            "role_requestor": "Requester",
            "role_approver": "Approver",
            "role_senior_approver": "Senior Approver",
            "role_finance_ops": "Finance Operations",
        }
        for role_id, role_name in role_nodes.items():
            self._safe_add_node(role_id, node_type="org_role", name=role_name)

        # Mock controls exactly as in grPH
        mock_controls = [
            ("CTRL-SOD-001", "Segregation of Duties"),
            ("CTRL-CYC-003", "Vendor Lifecycle"),
            ("CTRL-VEN-008", "Vendor Screening"),
            ("CTRL-THR-002", "Invoice Threshold"),
            ("CTRL-APP-005", "Approval Policy"),
            ("CTRL-DUP-006", "Duplicate Invoice"),
            ("CTRL-APP-004", "Approval Validation"),
            ("CTRL-PAY-007", "Payment Authorization"),
        ]
        for ctrl_id, ctrl_name in mock_controls:
            self._safe_add_node(ctrl_id, node_type="control", name=ctrl_name)
            self.graph.add_edge("policy_runtime", ctrl_id, edge_type="defines_control")

        for employee in dataset.employees:
            self._safe_add_node(
                employee.employee_id,
                node_type="employee",
                name=employee.name,
                department=employee.department,
                job_title=getattr(employee, "role", "Staff"),
            )

        for vendor in dataset.vendors:
            vendor_creation_id = f"vc_{vendor.vendor_id}"
            created_date = "2023-01-01"  # fallback date
            self._safe_add_node(
                vendor.vendor_id,
                node_type="vendor",
                name=vendor.name,
                created_date=created_date,
                created_by=vendor.created_by,
            )
            self._safe_add_node(
                vendor_creation_id,
                node_type="vendor_creation",
                created_by=vendor.created_by,
                created_date=created_date,
                vendor_id=vendor.vendor_id,
            )
            if vendor.created_by:
                if not self.graph.has_node(vendor.created_by):
                    self._safe_add_node(vendor.created_by, node_type="employee")
                self.graph.add_edge(vendor.created_by, "role_requestor", edge_type="holds_role")
                self.graph.add_edge(vendor.created_by, vendor_creation_id, edge_type="performed", date=created_date)
                # Semantic edge for graph_reasoner pathway detection
                self._add_edge(vendor.created_by, vendor.vendor_id, "CREATED_VENDOR")

            self.graph.add_edge(vendor_creation_id, vendor.vendor_id, edge_type="onboarded", date=created_date)
            self.graph.add_edge(vendor_creation_id, "CTRL-SOD-001", edge_type="governed_by")
            self.graph.add_edge(vendor.vendor_id, "CTRL-CYC-003", edge_type="monitored_by")
            self.graph.add_edge(vendor.vendor_id, "CTRL-VEN-008", edge_type="monitored_by")

        for invoice in dataset.invoices:
            submitted_by = invoice.submitted_by  # Optional[str] on the Invoice model
            invoice_date = "2023-02-01"
            self._safe_add_node(
                invoice.invoice_id,
                node_type="invoice",
                amount=invoice.amount,
                date=invoice_date,
                submitted_by=submitted_by,
            )
            if submitted_by:
                if not self.graph.has_node(submitted_by):
                    self._safe_add_node(submitted_by, node_type="employee")
                self.graph.add_edge(submitted_by, "role_requestor", edge_type="holds_role")
            self.graph.add_edge(invoice.vendor_id, invoice.invoice_id, edge_type="issued", date=invoice_date)
            # Semantic edge for graph_reasoner pathway detection
            self._add_edge(invoice.vendor_id, invoice.invoice_id, "ISSUED_INVOICE")
            self.graph.add_edge(invoice.invoice_id, "CTRL-THR-002", edge_type="governed_by")
            self.graph.add_edge(invoice.invoice_id, "CTRL-APP-005", edge_type="governed_by")
            self.graph.add_edge(invoice.invoice_id, "CTRL-DUP-006", edge_type="governed_by")

        for approval in dataset.approvals:
            if not self.graph.has_node(approval.employee_id):
                self._safe_add_node(approval.employee_id, node_type="employee")
            self.graph.add_edge(approval.employee_id, "role_approver", edge_type="holds_role")

            if approval.target_type == "vendor":
                # Vendor approval: add semantic edge for graph_reasoner
                self._add_edge(approval.employee_id, approval.target_id, "APPROVED_VENDOR")

            elif approval.target_type == "invoice":
                approval_decision_id = f"AD-{approval.target_id}"
                self._safe_add_node(
                    approval_decision_id,
                    node_type="approval_decision",
                    approved_by=approval.employee_id,
                    invoice_id=approval.target_id,
                )
                self.graph.add_edge(approval.target_id, approval_decision_id, edge_type="has_approval")
                self.graph.add_edge(approval_decision_id, approval.employee_id, edge_type="approved_by")
                self.graph.add_edge(approval_decision_id, "CTRL-SOD-001", edge_type="governed_by")
                self.graph.add_edge(approval_decision_id, "CTRL-APP-004", edge_type="governed_by")
                # Semantic edge for graph_reasoner pathway detection
                self._add_edge(approval.employee_id, approval.target_id, "APPROVED_INVOICE")

        for payment in dataset.payments:
            payment_decision_id = f"PD-{payment.payment_id}"
            approval_id = f"AD-{payment.invoice_id}"
            approver = self.graph.nodes[approval_id].get("approved_by") if self.graph.has_node(approval_id) else None
            payment_date = "2023-03-01"

            self._safe_add_node(
                payment.payment_id,
                node_type="transaction",
                amount=payment.amount,
                date=payment_date,
            )
            self._safe_add_node(
                payment_decision_id,
                node_type="payment_decision",
                invoice_id=payment.invoice_id,
                transaction_id=payment.payment_id,
                authorized_by=approver or "system_unapproved",
                decision_date=payment_date,
            )
            self.graph.add_edge(payment.invoice_id, payment_decision_id, edge_type="ready_for_payment", date=payment_date)
            self.graph.add_edge(payment_decision_id, payment.payment_id, edge_type="authorized_payment", date=payment_date)
            self.graph.add_edge(payment.invoice_id, payment.payment_id, edge_type="paid_by", date=payment_date)
            self.graph.add_edge(payment.payment_id, "CTRL-PAY-007", edge_type="governed_by")
            # Semantic edges for graph_reasoner: invoice -> payment chain
            self._add_edge(payment.invoice_id, payment.payment_id, "EXECUTED_PAYMENT")

            if approver:
                self.graph.add_edge(approver, payment_decision_id, edge_type="authorized_by")
                self.graph.add_edge(approver, "role_finance_ops", edge_type="holds_role")
                # Semantic edge: executor -> payment for pathway detection
                self._add_edge(approver, payment.payment_id, "EXECUTED_PAYMENT")
            else:
                self.graph.add_edge(payment_decision_id, "CTRL-APP-005", edge_type="violates_if_missing")

        for relation in dataset.relationships:
             pass # Optional custom relations

    def add_decision_nodes(self, decisions: Iterable[Decision]) -> None:
        for decision in decisions:
            self._safe_add_node(
                decision.decision_id,
                "Decision",
                label=decision.action,
                actor_id=decision.actor_id,
                action=decision.action,
                timestamp=decision.timestamp.isoformat(),
                context=decision.context,
            )
            self._add_edge(decision.actor_id, decision.decision_id, "DECISION_LINK")
            for context_value in decision.context.values():
                if isinstance(context_value, str) and self.graph.has_node(context_value):
                    self._add_edge(decision.decision_id, context_value, "DECISION_LINK")

    def add_rule_results(self, rule_results: Iterable[RuleResult]) -> None:
        for result in rule_results:
            rule_node_id = f"RULE:{result.rule_id}"
            self._safe_add_node(
                rule_node_id,
                "Rule",
                label=result.rule_id,
                risk_score=result.risk_score,
                confidence=result.confidence,
                evidence=result.evidence,
                origin=result.origin,
            )
            for node_id in result.triggered_nodes:
                if self.graph.has_node(node_id):
                    self._add_edge(node_id, rule_node_id, "TRIGGERED_RULE")

    def add_cases(self, cases: Iterable[CaseResult]) -> None:
        for case in cases:
            self._safe_add_node(
                case.case_id,
                "Case",
                label=case.case_id,
                risk_level=case.risk_level,
                trust_score=case.trust_score,
                confidence=case.confidence,
                pathway_type=case.pathway_type,
                trace_id=case.trace_id,
                visibility=case.visibility,
                company_id=case.company_id,
                status=case.status,
                owner=case.owner,
                status_updated_at=case.status_updated_at.isoformat() if case.status_updated_at else None,
            )
            for node_id in case.path_nodes:
                if self.graph.has_node(node_id):
                    self._add_edge(node_id, case.case_id, "PART_OF_CASE")
            for rule_id in case.rules_triggered:
                rule_node_id = f"RULE:{rule_id}"
                if self.graph.has_node(rule_node_id):
                    self._add_edge(rule_node_id, case.case_id, "PART_OF_CASE")
