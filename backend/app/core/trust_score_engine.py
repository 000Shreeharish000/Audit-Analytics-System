from __future__ import annotations

from app.core.secure_ai_inference import SecureAIInferenceEngine


class TrustScoreEngine:
    def __init__(self, secure_ai: SecureAIInferenceEngine) -> None:
        self.secure_ai = secure_ai

    def compute(
        self,
        *,
        rule_confidence: float,
        path_length: int,
        actor_repetition: int,
        transaction_amount: float,
        policy_violation_severity: float,
    ) -> dict[str, float | str]:
        return self.secure_ai.score_case(
            avg_rule_confidence=rule_confidence,
            path_length=path_length,
            actor_repetition=actor_repetition,
            transaction_amount=transaction_amount,
            policy_violation_severity=policy_violation_severity,
        )

