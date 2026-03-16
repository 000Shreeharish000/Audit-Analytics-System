from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from app.config import Settings
from app.core.secure_ai_inference import SecureAIInferenceEngine
from app.models.decision import DatasetPayload, RuleResult


class GovernanceRuleEngine:
    def __init__(self, settings: Settings, secure_ai: SecureAIInferenceEngine) -> None:
        self.settings = settings
        self.secure_ai = secure_ai

    def run(self, dataset: DatasetPayload) -> list[RuleResult]:
        results: list[RuleResult] = []
        results.extend(self._vendor_self_approval(dataset))
        results.extend(self._just_below_threshold(dataset))
        results.extend(self._high_value_low_approval(dataset))
        results.extend(self._rapid_approval_chain(dataset))
        results.extend(self._invoice_splitting(dataset))
        results.extend(self._role_collision(dataset))
        return results

    def _vendor_self_approval(self, dataset: DatasetPayload) -> list[RuleResult]:
        triggered_nodes: list[str] = []
        impacted_amount = 0.0
        vendor_ids = []

        invoices_by_vendor = defaultdict(float)
        for invoice in dataset.invoices:
            invoices_by_vendor[invoice.vendor_id] += invoice.amount

        for vendor in dataset.vendors:
            if vendor.approved_by and vendor.approved_by == vendor.created_by:
                triggered_nodes.extend([vendor.approved_by, vendor.vendor_id])
                vendor_ids.append(vendor.vendor_id)
                impacted_amount += invoices_by_vendor.get(vendor.vendor_id, 0.0)

        if not triggered_nodes:
            return []

        scoring = self.secure_ai.score_rule(
            base_risk=56,
            confidence=0.9,
            severity=0.95,
            amount=impacted_amount,
            actor_repetition=max(1, len(set(triggered_nodes)) // 2),
        )
        return [
            RuleResult(
                rule_id="RULE_VENDOR_SELF_APPROVAL",
                risk_score=scoring["risk_score"],
                triggered_nodes=sorted(set(triggered_nodes)),
                evidence=f"Vendors self-approved by creator: {', '.join(vendor_ids)}.",
                confidence=scoring["confidence"],
                severity=scoring["severity"],
            )
        ]

    def _just_below_threshold(self, dataset: DatasetPayload) -> list[RuleResult]:
        low = self.settings.invoice_approval_threshold * 0.9
        high = self.settings.invoice_approval_threshold

        invoice_map = {invoice.invoice_id: invoice for invoice in dataset.invoices}
        approvals_by_employee = defaultdict(list)

        for approval in dataset.approvals:
            if approval.target_type != "invoice":
                continue
            invoice = invoice_map.get(approval.target_id)
            if not invoice:
                continue
            if low <= invoice.amount < high:
                approvals_by_employee[approval.employee_id].append(invoice)

        suspects = {
            employee: invoices
            for employee, invoices in approvals_by_employee.items()
            if len(invoices) >= 2
        }
        if not suspects:
            return []

        triggered_nodes = []
        evidence_fragments = []
        total_amount = 0.0
        for employee, invoices in suspects.items():
            ids = [invoice.invoice_id for invoice in invoices]
            subtotal = sum(invoice.amount for invoice in invoices)
            total_amount += subtotal
            triggered_nodes.extend([employee, *ids])
            evidence_fragments.append(
                f"{employee} approved near-threshold invoices {ids} totaling INR {subtotal:,.0f}"
            )

        scoring = self.secure_ai.score_rule(
            base_risk=50,
            confidence=0.82,
            severity=0.78,
            amount=total_amount,
            actor_repetition=len(suspects),
        )
        return [
            RuleResult(
                rule_id="RULE_JUST_BELOW_THRESHOLD_INVOICES",
                risk_score=scoring["risk_score"],
                triggered_nodes=sorted(set(triggered_nodes)),
                evidence="; ".join(evidence_fragments),
                confidence=scoring["confidence"],
                severity=scoring["severity"],
            )
        ]

    def _high_value_low_approval(self, dataset: DatasetPayload) -> list[RuleResult]:
        invoice_map = {invoice.invoice_id: invoice for invoice in dataset.invoices}
        approvals_by_invoice = defaultdict(list)
        payment_by_invoice = defaultdict(list)

        for approval in dataset.approvals:
            if approval.target_type == "invoice":
                approvals_by_invoice[approval.target_id].append(approval)
        for payment in dataset.payments:
            payment_by_invoice[payment.invoice_id].append(payment)

        risky = []
        for invoice_id, invoice in invoice_map.items():
            if invoice.amount < self.settings.high_value_payment_threshold:
                continue
            approvals = approvals_by_invoice[invoice_id]
            payments = payment_by_invoice[invoice_id]
            if payments and len(approvals) < self.settings.required_high_value_approvals:
                risky.append((invoice, approvals, payments))

        if not risky:
            return []

        triggered_nodes = []
        total_amount = 0.0
        evidence_parts = []
        for invoice, approvals, payments in risky:
            total_amount += invoice.amount
            triggered_nodes.append(invoice.invoice_id)
            triggered_nodes.extend(approval.employee_id for approval in approvals)
            triggered_nodes.extend(payment.payment_id for payment in payments)
            evidence_parts.append(
                f"{invoice.invoice_id} amount INR {invoice.amount:,.0f} had {len(approvals)} approvals"
            )

        scoring = self.secure_ai.score_rule(
            base_risk=60,
            confidence=0.86,
            severity=0.92,
            amount=total_amount,
            actor_repetition=2,
        )
        return [
            RuleResult(
                rule_id="RULE_HIGH_VALUE_LOW_APPROVAL",
                risk_score=scoring["risk_score"],
                triggered_nodes=sorted(set(triggered_nodes)),
                evidence="; ".join(evidence_parts),
                confidence=scoring["confidence"],
                severity=scoring["severity"],
            )
        ]

    def _rapid_approval_chain(self, dataset: DatasetPayload) -> list[RuleResult]:
        invoices_by_id = {invoice.invoice_id: invoice for invoice in dataset.invoices}
        payments_by_invoice = defaultdict(list)
        for payment in dataset.payments:
            payments_by_invoice[payment.invoice_id].append(payment)

        rapid_events = []
        for approval in dataset.approvals:
            if approval.target_type != "invoice":
                continue
            invoice = invoices_by_id.get(approval.target_id)
            if not invoice:
                continue
            for payment in payments_by_invoice[invoice.invoice_id]:
                total_window = payment.executed_at - invoice.created_at
                if total_window <= timedelta(hours=8):
                    rapid_events.append((approval, invoice, payment, total_window))

        if len(rapid_events) < 2:
            return []

        triggered_nodes = []
        evidence = []
        total_amount = 0.0
        for approval, invoice, payment, window in rapid_events:
            total_amount += payment.amount
            triggered_nodes.extend(
                [approval.employee_id, approval.approval_id, invoice.invoice_id, payment.payment_id]
            )
            evidence.append(
                f"{invoice.invoice_id} moved from issue to payment in {int(window.total_seconds() // 3600)}h"
            )

        scoring = self.secure_ai.score_rule(
            base_risk=48,
            confidence=0.77,
            severity=0.73,
            amount=total_amount,
            actor_repetition=2,
        )
        return [
            RuleResult(
                rule_id="RULE_RAPID_APPROVAL_CHAIN",
                risk_score=scoring["risk_score"],
                triggered_nodes=sorted(set(triggered_nodes)),
                evidence="; ".join(evidence),
                confidence=scoring["confidence"],
                severity=scoring["severity"],
            )
        ]

    def _invoice_splitting(self, dataset: DatasetPayload) -> list[RuleResult]:
        grouped = defaultdict(list)
        threshold = self.settings.invoice_approval_threshold

        for invoice in dataset.invoices:
            grouped[invoice.vendor_id].append(invoice)

        suspicious = []
        seen_windows = set()
        for vendor_id, invoices in grouped.items():
            invoices = sorted(invoices, key=lambda inv: inv.created_at)
            for index, invoice in enumerate(invoices):
                if invoice.amount >= threshold:
                    continue
                window = [invoice]
                for next_invoice in invoices[index + 1 :]:
                    if next_invoice.created_at - invoice.created_at <= timedelta(days=2):
                        if next_invoice.amount < threshold:
                            window.append(next_invoice)
                if len(window) >= 2:
                    total = sum(item.amount for item in window)
                    if total >= threshold * 1.5:
                        key = (vendor_id, tuple(sorted(item.invoice_id for item in window)))
                        if key not in seen_windows:
                            seen_windows.add(key)
                            suspicious.append((vendor_id, window, total))

        if not suspicious:
            return []

        triggered_nodes = []
        evidence_lines = []
        total_amount = 0.0
        for vendor_id, invoices, subtotal in suspicious:
            invoice_ids = [invoice.invoice_id for invoice in invoices]
            triggered_nodes.extend([vendor_id, *invoice_ids])
            total_amount += subtotal
            evidence_lines.append(
                f"Vendor {vendor_id} split invoices {invoice_ids} totaling INR {subtotal:,.0f}"
            )

        scoring = self.secure_ai.score_rule(
            base_risk=54,
            confidence=0.84,
            severity=0.81,
            amount=total_amount,
            actor_repetition=1,
        )
        return [
            RuleResult(
                rule_id="RULE_INVOICE_SPLITTING_PATTERN",
                risk_score=scoring["risk_score"],
                triggered_nodes=sorted(set(triggered_nodes)),
                evidence="; ".join(evidence_lines),
                confidence=scoring["confidence"],
                severity=scoring["severity"],
            )
        ]

    def _role_collision(self, dataset: DatasetPayload) -> list[RuleResult]:
        vendor_creators = {vendor.vendor_id: vendor.created_by for vendor in dataset.vendors}
        invoice_map = {invoice.invoice_id: invoice for invoice in dataset.invoices}
        invoice_approvers = defaultdict(set)
        for approval in dataset.approvals:
            if approval.target_type == "invoice":
                invoice_approvers[approval.target_id].add(approval.employee_id)

        collisions = []
        for payment in dataset.payments:
            invoice = invoice_map.get(payment.invoice_id)
            if not invoice:
                continue
            creator = vendor_creators.get(invoice.vendor_id)
            approvers = invoice_approvers.get(invoice.invoice_id, set())
            actors = {creator, *approvers, payment.executed_by}
            if creator and len({actor for actor in actors if actor}) <= 2:
                collisions.append((invoice, payment, creator, approvers))

        if not collisions:
            return []

        triggered_nodes = []
        evidence_lines = []
        amount = 0.0
        for invoice, payment, creator, approvers in collisions:
            amount += payment.amount
            triggered_nodes.extend([invoice.invoice_id, payment.payment_id, creator, *approvers])
            evidence_lines.append(
                f"Invoice {invoice.invoice_id} and payment {payment.payment_id} executed with concentrated roles"
            )

        scoring = self.secure_ai.score_rule(
            base_risk=58,
            confidence=0.83,
            severity=0.85,
            amount=amount,
            actor_repetition=2,
        )
        return [
            RuleResult(
                rule_id="RULE_ROLE_COLLISION_PATTERN",
                risk_score=scoring["risk_score"],
                triggered_nodes=sorted({node for node in triggered_nodes if node}),
                evidence="; ".join(evidence_lines),
                confidence=scoring["confidence"],
                severity=scoring["severity"],
            )
        ]
