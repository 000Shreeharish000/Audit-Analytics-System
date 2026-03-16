from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean
from typing import List
from uuid import uuid4

import networkx as nx

from app.core.graph_reasoner import GraphReasoner
from app.core.trust_score_engine import TrustScoreEngine
from app.models.decision import CaseResult, RuleResult


class PathwayDetector:
    def __init__(
        self,
        graph_reasoner: GraphReasoner,
        trust_score_engine: TrustScoreEngine,
    ) -> None:
        self.graph_reasoner = graph_reasoner
        self.trust_score_engine = trust_score_engine

    def detect(
        self,
        graph: nx.MultiDiGraph,
        rule_results: List[RuleResult],
    ) -> List[CaseResult]:
        pathways = self.graph_reasoner.find_control_bypass_paths(graph)
        cases: List[CaseResult] = []

        for index, pathway in enumerate(pathways, start=1):
            pathway_nodes = [str(node) for node in pathway["path_nodes"]]
            actors = [str(actor) for actor in pathway.get("actors", [])]
            payment_id = str(pathway["payment"])
            payment_amount = float(graph.nodes[payment_id].get("amount", 0.0))

            matched_rules = [
                rule
                for rule in rule_results
                if any(node in rule.triggered_nodes for node in pathway_nodes)
            ]
            if not matched_rules:
                continue

            confidence = mean(rule.confidence for rule in matched_rules)
            severity = mean(rule.severity for rule in matched_rules)
            actor_counts = dict(pathway.get("actor_step_counts", {}))
            actor_repetition = max(actor_counts.values()) if actor_counts else 1
            trust = self.trust_score_engine.compute(
                rule_confidence=confidence,
                path_length=int(pathway["path_length"]),
                actor_repetition=actor_repetition,
                transaction_amount=payment_amount,
                policy_violation_severity=severity,
            )

            cases.append(
                CaseResult(
                    case_id=f"CASE-{index:03d}",
                    risk_level=str(trust["risk_level"]),
                    actors_involved=actors,
                    path_nodes=pathway_nodes,
                    rules_triggered=sorted({rule.rule_id for rule in matched_rules}),
                    trust_score=float(trust["trust_score"]),
                    confidence=float(trust["confidence"]),
                    transaction_amount=payment_amount,
                    created_at=datetime.now(timezone.utc),
                    pathway_type=str(pathway.get("pathway_type", "single_actor_bypass")),
                    actor_step_counts=actor_counts,
                    trace_id=str(uuid4()),
                )
            )

        cases.sort(key=lambda case: case.trust_score, reverse=True)
        return cases

