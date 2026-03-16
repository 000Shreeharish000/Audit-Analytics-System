from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.secure_ai_inference import SecureAIInferenceEngine
from app.models.decision import CaseResult, DatasetPayload, InvestigationReport, RuleResult


class ExplanationEngine:
    def __init__(self, secure_ai: SecureAIInferenceEngine) -> None:
        self.secure_ai = secure_ai

    def generate(
        self,
        case: CaseResult,
        dataset: DatasetPayload,
        rule_results: list[RuleResult],
        agent_analysis: Optional[Dict[str, Any]] = None,
    ) -> InvestigationReport:
        vendor_map = {vendor.vendor_id: vendor for vendor in dataset.vendors}
        invoice_map = {invoice.invoice_id: invoice for invoice in dataset.invoices}
        payment_map = {payment.payment_id: payment for payment in dataset.payments}

        actor = case.actors_involved[0] if case.actors_involved else "Unknown"
        vendor_id = next((node for node in case.path_nodes if node in vendor_map), "Unknown")
        invoice_id = next((node for node in case.path_nodes if node in invoice_map), "Unknown")
        payment_id = next((node for node in case.path_nodes if node in payment_map), "Unknown")

        invoice_amount = invoice_map.get(invoice_id).amount if invoice_id in invoice_map else 0
        vendor_created_by_actor = (
            vendor_id in vendor_map and vendor_map[vendor_id].created_by == actor
        )
        vendor_approved_by_actor = (
            vendor_id in vendor_map and vendor_map[vendor_id].approved_by == actor
        )

        sequence = [
            f"Employee {actor} created vendor {vendor_id}."
            if vendor_created_by_actor
            else f"Vendor {vendor_id} was present in the transaction path.",
            f"Employee {actor} approved vendor {vendor_id}."
            if vendor_approved_by_actor
            else f"Vendor approval chain includes employee {actor}.",
            f"Invoice {invoice_id} totaling INR {invoice_amount:,.0f} was approved in the same decision chain.",
            f"Payment {payment_id} was executed, completing the bypass pathway.",
        ]

        triggered = {rule.rule_id: rule for rule in rule_results if rule.rule_id in case.rules_triggered}
        rule_explanations = "; ".join(rule.evidence for rule in triggered.values())

        summary = self.secure_ai.explain(
            template=(
                "Control bypass case {case_id} indicates separation-of-duty failure "
                "with trust score {trust_score} and risk level {risk_level}."
            ),
            values={
                "case_id": case.case_id,
                "trust_score": case.trust_score,
                "risk_level": case.risk_level,
            },
        )

        risk_explanation = self.secure_ai.explain(
            template=(
                "Employee {actor} created and/or approved vendor {vendor_id}, approved invoice {invoice_id}, "
                "and the chain ended in payment {payment_id}. This sequence bypasses internal governance controls. "
                "Rule evidence: {rule_evidence}"
            ),
            values={
                "actor": actor,
                "vendor_id": vendor_id,
                "invoice_id": invoice_id,
                "payment_id": payment_id,
                "rule_evidence": rule_explanations or "No additional evidence available.",
            },
        )

        recommended_actions = [
            "Freeze related vendor and payment records pending audit review.",
            "Enforce maker-checker separation on vendor onboarding and invoice approvals.",
            "Require multi-level approvals for high-value or rapid-chain payments.",
            "Conduct retrospective review of all invoices from the flagged vendor.",
        ]

        counterfactual_analysis = (
            "A benign explanation could be urgent payment processing during operational pressure. "
            "However, repeated role overlap, threshold-adjacent invoicing, and accelerated approvals "
            "reduce the plausibility of non-malicious behavior."
        )

        timeline = [
            {"step": index + 1, "node_id": node_id, "description": f"Path node {node_id}"}
            for index, node_id in enumerate(case.path_nodes)
        ]
        traceability = {
            "trace_id": case.trace_id,
            "pathway_type": case.pathway_type,
            "actor_step_counts": case.actor_step_counts,
            "case_status": case.status,
            "case_owner": case.owner,
            "rule_evidence_map": {
                rule.rule_id: rule.evidence for rule in rule_results if rule.rule_id in case.rules_triggered
            },
        }

        return InvestigationReport(
            case_id=case.case_id,
            summary=summary,
            actors_involved=case.actors_involved,
            sequence_of_events=sequence,
            rules_triggered=case.rules_triggered,
            risk_explanation=risk_explanation,
            counterfactual_analysis=counterfactual_analysis,
            recommended_audit_actions=recommended_actions,
            trust_score=case.trust_score,
            confidence=case.confidence,
            generated_at=datetime.now(timezone.utc),
            timeline=timeline,
            traceability=traceability,
            agent_analysis=agent_analysis,
        )
