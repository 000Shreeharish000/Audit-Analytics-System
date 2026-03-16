from __future__ import annotations

import json
from pathlib import Path

import networkx as nx

from app.config import load_settings
from app.core.decision_engine import DecisionEngine
from app.core.graph_reasoner import GraphReasoner
from app.core.pathway_detector import PathwayDetector
from app.core.rule_engine import GovernanceRuleEngine
from app.core.secure_ai_inference import SecureAIInferenceEngine
from app.core.trust_score_engine import TrustScoreEngine
from app.graph.graph_builder import DigitalTwinGraphBuilder
from app.models.decision import DatasetPayload


def _load_dataset() -> DatasetPayload:
    dataset_path = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "data"
        / "simulated_enterprise_dataset.json"
    )
    with dataset_path.open("r", encoding="utf-8") as file:
        return DatasetPayload.model_validate(json.load(file))


def test_rules_include_role_collision_and_no_duplicate_split_windows() -> None:
    dataset = _load_dataset()
    ai = SecureAIInferenceEngine()
    engine = GovernanceRuleEngine(load_settings(), ai)
    results = engine.run(dataset)
    rule_ids = {result.rule_id for result in results}
    assert "RULE_ROLE_COLLISION_PATTERN" in rule_ids

    split_rule = next(result for result in results if result.rule_id == "RULE_INVOICE_SPLITTING_PATTERN")
    evidence_parts = [part.strip() for part in split_rule.evidence.split(";") if part.strip()]
    assert len(evidence_parts) == len(set(evidence_parts))


def test_pathway_detection_returns_cases_with_traceability() -> None:
    dataset = _load_dataset()
    graph = nx.MultiDiGraph()
    builder = DigitalTwinGraphBuilder(graph)
    builder.build_from_dataset(dataset)
    decisions = DecisionEngine().generate(dataset)
    builder.add_decision_nodes(decisions)

    ai = SecureAIInferenceEngine()
    rule_engine = GovernanceRuleEngine(load_settings(), ai)
    rule_results = rule_engine.run(dataset)
    builder.add_rule_results(rule_results)

    detector = PathwayDetector(GraphReasoner(), TrustScoreEngine(ai))
    cases = detector.detect(graph, rule_results)
    assert len(cases) > 0
    assert all(case.trace_id for case in cases)
    assert all(case.pathway_type for case in cases)

