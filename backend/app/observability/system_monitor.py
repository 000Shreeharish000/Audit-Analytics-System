from __future__ import annotations

from typing import Dict

import networkx as nx

from app.models.decision import CompanyPolicyProfile


def _risk_level_from_score(score: float) -> str:
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


class SystemMonitor:
    def state_snapshot(self, container) -> Dict[str, object]:  # type: ignore[no-untyped-def]
        density = nx.density(container.graph) if container.graph.number_of_nodes() > 1 else 0
        max_risk = max(
            (case.trust_score for case in container.cases.values()),
            default=0,
        )
        case_status_counts = {}
        for case in container.cases.values():
            case_status_counts[case.status] = case_status_counts.get(case.status, 0) + 1
        audit_status = container.audit_logger.verify_chain()
        storage_counts = container.store.counts()
        company_id = getattr(container.dataset, "company_id", None) if container.dataset else None
        policy_rules_in_scope = 0
        policy_documents_in_scope = 0
        if company_id:
            active_payload = container.store.get_company_policy(company_id)
            active_profile = CompanyPolicyProfile.model_validate(active_payload) if active_payload else None
            draft_profile = container._latest_draft_policy(company_id)
            effective_policy = draft_profile or active_profile
            policy_rules_in_scope = len(effective_policy.rules) if effective_policy else 0
            policy_documents_in_scope = len(container.store.recent_policy_documents(company_id, limit=500))
        return {
            "events_processed": container.event_tracker.count(),
            "nodes_created": container.graph.number_of_nodes(),
            "decisions_created": len(container.decisions),
            "rules_triggered": len(container.rule_results),
            "policy_rules_in_scope": policy_rules_in_scope,
            "policy_documents_in_scope": policy_documents_in_scope,
            "cases_detected": len(container.cases),
            "graph_density": round(float(density), 6),
            "risk_level": _risk_level_from_score(max_risk),
            "case_status_counts": case_status_counts,
            "audit_chain_valid": audit_status.get("valid", False),
            "storage_counts": storage_counts,
            "components": {
                "ingestion_engine": "active" if container.dataset else "idle",
                "graph_engine": "active" if container.graph.number_of_nodes() else "idle",
                "rule_engine": "active" if container.rule_results else "idle",
                "pathway_detector": "active" if container.cases else "idle",
                "explanation_engine": "active" if container.investigations else "idle",
                "persistence_layer": "active",
                "backup_manager": "active",
                "agent_orchestrator": "active",
            },
        }
