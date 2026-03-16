from __future__ import annotations

from typing import Dict


class SecureAIInferenceEngine:
    """
    Deterministic, air-gapped reasoning engine.
    No external calls, no stochastic output, no internet dependency.
    """

    @staticmethod
    def risk_band(score: float) -> str:
        if score >= 85:
            return "CRITICAL"
        if score >= 65:
            return "HIGH"
        if score >= 40:
            return "MEDIUM"
        return "LOW"

    def score_rule(
        self,
        *,
        base_risk: float,
        confidence: float,
        severity: float,
        amount: float = 0.0,
        actor_repetition: int = 1,
    ) -> Dict[str, float]:
        amount_factor = min(amount / 2000000, 1.0) * 15
        repetition_factor = min(max(actor_repetition - 1, 0), 5) * 4
        score = min(100.0, base_risk + (confidence * 20) + (severity * 20) + amount_factor + repetition_factor)
        return {
            "risk_score": round(score, 2),
            "confidence": round(min(max(confidence, 0.0), 1.0), 2),
            "severity": round(min(max(severity, 0.0), 1.0), 2),
        }

    def score_case(
        self,
        *,
        avg_rule_confidence: float,
        path_length: int,
        actor_repetition: int,
        transaction_amount: float,
        policy_violation_severity: float,
    ) -> Dict[str, float | str]:
        score = (
            (avg_rule_confidence * 30)
            + (min(path_length, 8) / 8 * 20)
            + (min(actor_repetition, 5) / 5 * 20)
            + (min(transaction_amount, 3000000) / 3000000 * 15)
            + (policy_violation_severity * 15)
        )
        score = min(100.0, score)
        return {
            "trust_score": round(score, 2),
            "confidence": round(min(1.0, 0.45 + avg_rule_confidence * 0.5), 2),
            "risk_level": self.risk_band(score),
        }

    def explain(self, template: str, values: Dict[str, object]) -> str:
        return template.format(**values)

