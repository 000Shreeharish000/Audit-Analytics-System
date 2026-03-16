from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List

from app.config import Settings
from app.core.model_governor import ModelGovernor
from app.core.secure_ai_inference import SecureAIInferenceEngine


class MultiAgentOrchestrator:
    def __init__(
        self,
        settings: Settings,
        secure_ai: SecureAIInferenceEngine,
        model_governor: ModelGovernor,
        audit_logger,
    ) -> None:  # type: ignore[no-untyped-def]
        self.settings = settings
        self.secure_ai = secure_ai
        self.model_governor = model_governor
        self.audit_logger = audit_logger

    def _agent_templates(self) -> List[Dict[str, str]]:
        return [
            {
                "agent_name": "graph_analyst",
                "objective": "Explain the suspicious transaction graph pathway.",
            },
            {
                "agent_name": "policy_critic",
                "objective": "Identify governance and control-policy violations.",
            },
            {
                "agent_name": "counterfactual_agent",
                "objective": "Assess benign explanations and highlight unresolved risk.",
            },
            {
                "agent_name": "remediation_agent",
                "objective": "Recommend prioritized remediation actions for audit.",
            },
        ]

    def _local_opinion(self, agent_name: str, context: Dict[str, Any]) -> Dict[str, Any]:
        case_id = context.get("case_id", "UNKNOWN")
        risk_level = context.get("risk_level", "LOW")
        summary = self.secure_ai.explain(
            template=(
                "[{agent}] Case {case_id} indicates {risk_level} governance risk with "
                "deterministic local reasoning."
            ),
            values={"agent": agent_name, "case_id": case_id, "risk_level": risk_level},
        )
        return {
            "agent_name": agent_name,
            "provider": "local_secure_ai",
            "model": "deterministic-rule-engine",
            "summary": summary,
            "confidence": 0.86,
            "recommendations": context.get("recommended_audit_actions", [])[:3],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "external": False,
        }

    def _external_opinion(
        self,
        *,
        agent_name: str,
        objective: str,
        model_name: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not self.model_governor.external_enabled():
            return {}
        if not self.model_governor.model_allowed(model_name):
            return {}

        sanitized = self.model_governor.sanitize_for_external(context)
        prompt = (
            f"Agent role: {agent_name}\n"
            f"Objective: {objective}\n"
            f"Return a concise governance analysis and recommended actions.\n"
            f"Context: {sanitized['sanitized_context']}"
        )

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You are an enterprise governance analyst."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 350,
        }
        body = json.dumps(payload).encode("utf-8")
        endpoint = self.settings.external_ai_base_url.rstrip("/") + "/chat/completions"
        request = urllib.request.Request(
            endpoint,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.settings.external_ai_api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(  # nosec B310
                request, timeout=self.settings.external_ai_timeout_seconds
            ) as response:
                response_body = response.read().decode("utf-8")
            parsed = json.loads(response_body)
            choices = parsed.get("choices", [])
            message = ""
            if choices and isinstance(choices[0], dict):
                message = str(choices[0].get("message", {}).get("content", "")).strip()

            return {
                "agent_name": agent_name,
                "provider": "external_openai_compatible",
                "model": model_name,
                "summary": message[:2000] if message else "No response content",
                "confidence": 0.74,
                "recommendations": [],
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "external": True,
                "egress_policy": sanitized["policy"],
            }
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
            self.audit_logger.log(
                "external_model_call_failed",
                actor="system",
                details={"agent_name": agent_name, "model": model_name, "error": str(exc)},
            )
            return {}

    def _consensus(self, opinions: List[Dict[str, Any]], case_context: Dict[str, Any]) -> Dict[str, Any]:
        confidence_values = [float(opinion.get("confidence", 0.0)) for opinion in opinions]
        avg_confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0.0
        unique_providers = sorted({str(opinion.get("provider", "")) for opinion in opinions})
        recommendations = []
        seen = set()
        for opinion in opinions:
            for item in opinion.get("recommendations", []):
                if item not in seen:
                    seen.add(item)
                    recommendations.append(item)
        if not recommendations:
            recommendations = case_context.get("recommended_audit_actions", [])[:4]

        conflict_score = 0.0
        if confidence_values:
            spread = max(confidence_values) - min(confidence_values)
            conflict_score = round(min(spread * 100, 100), 2)

        return {
            "overall_risk_level": case_context.get("risk_level", "LOW"),
            "average_confidence": round(avg_confidence, 2),
            "conflict_score": conflict_score,
            "providers_used": unique_providers,
            "final_recommendations": recommendations[:6],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def analyze_case(self, case_context: Dict[str, Any]) -> Dict[str, Any]:
        opinions: List[Dict[str, Any]] = []

        for template in self._agent_templates():
            agent_name = template["agent_name"]
            objective = template["objective"]

            local = self._local_opinion(agent_name, case_context)
            opinions.append(local)

            for model_name in self.model_governor.approved_models():
                external = self._external_opinion(
                    agent_name=agent_name,
                    objective=objective,
                    model_name=model_name,
                    context=case_context,
                )
                if external:
                    opinions.append(external)

        consensus = self._consensus(opinions, case_context)
        return {
            "mode": "hybrid" if self.model_governor.external_enabled() else "air_gapped_only",
            "opinions": opinions,
            "consensus": consensus,
        }
