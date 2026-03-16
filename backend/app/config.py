from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Dict, List
from urllib.parse import urlparse


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_env: str
    app_version: str
    allowed_hosts: List[str]
    cors_origins: List[str]
    jwt_secret_key: str
    jwt_algorithm: str
    jwt_issuer: str
    jwt_audience: str
    access_token_expire_minutes: int
    max_failed_logins: int
    lockout_minutes: int
    password_min_length: int
    rate_limit_per_minute: int
    max_request_size_mb: int
    invoice_approval_threshold: float
    high_value_payment_threshold: float
    required_high_value_approvals: int
    database_path: str
    audit_log_path: str
    audit_hmac_key: str
    data_encryption_key: str
    backup_dir: str
    backup_retention_count: int
    enable_external_ai: bool
    external_ai_base_url: str
    external_ai_api_key: str
    external_ai_models: List[str]
    external_ai_timeout_seconds: int
    bootstrap_users: Dict[str, Dict[str, str]]


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_external_ai_enabled(value: str | None, *, key_present: bool) -> bool:
    if value is None or not value.strip():
        return key_present
    normalized = value.strip().lower()
    if normalized == "auto":
        return key_present
    return normalized in {"1", "true", "yes", "on"}


def _parse_csv(value: str, fallback: List[str]) -> List[str]:
    if not value:
        return fallback
    parsed = [item.strip() for item in value.split(",") if item.strip()]
    return parsed or fallback


def _expand_cors_origins(origins: List[str]) -> List[str]:
    expanded: List[str] = []
    seen: set[str] = set()
    for origin in origins:
        normalized = origin.strip().rstrip("/")
        if not normalized:
            continue
        candidates = [normalized]
        parsed = urlparse(normalized)
        if parsed.scheme in {"http", "https"} and parsed.hostname and parsed.port is None:
            candidates.append(f"{parsed.scheme}://{parsed.hostname}:3000")
        for candidate in candidates:
            if candidate not in seen:
                seen.add(candidate)
                expanded.append(candidate)
    return expanded


def _parse_bootstrap_users(raw: str) -> Dict[str, Dict[str, str]]:
    if raw:
        try:
            payload = json.loads(raw)
            if isinstance(payload, dict):
                normalized: Dict[str, Dict[str, str]] = {}
                for username, data in payload.items():
                    if not isinstance(data, dict):
                        continue
                    password = str(data.get("password", ""))
                    role = str(data.get("role", ""))
                    if username and password and role:
                        normalized[str(username)] = {"password": password, "role": role}
                if normalized:
                    return normalized
        except json.JSONDecodeError:
            pass
    return {
        "admin": {"password": "Admin@12345", "role": "admin"},
        "auditor": {"password": "Auditor@12345", "role": "auditor"},
        "risk_analyst": {"password": "Risk@12345", "role": "risk_analyst"},
    }


def load_settings() -> Settings:
    default_external_models = ["gpt-4o-mini", "gpt-4.1-mini"]
    external_ai_api_key = (
        os.getenv("EXTERNAL_AI_API_KEY", "").strip()
        or os.getenv("OPENAI_API_KEY", "").strip()
    )
    enable_external_ai = _resolve_external_ai_enabled(
        os.getenv("ENABLE_EXTERNAL_AI"),
        key_present=bool(external_ai_api_key),
    )
    return Settings(
        app_name=os.getenv("APP_NAME", "Decision & Financial Digital Twin Platform"),
        app_env=os.getenv("APP_ENV", "local"),
        app_version=os.getenv("APP_VERSION", "1.1.0"),
        allowed_hosts=_parse_csv(
            os.getenv("ALLOWED_HOSTS", ""),
            ["127.0.0.1", "localhost", "testserver"],
        ),
        cors_origins=_expand_cors_origins(
            _parse_csv(
                os.getenv("CORS_ORIGINS", ""),
                [
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                    "http://localhost",
                    "http://127.0.0.1",
                ],
            )
        ),
        jwt_secret_key=os.getenv("JWT_SECRET_KEY", "change-this-secret-for-production"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        jwt_issuer=os.getenv("JWT_ISSUER", "decision-digital-twin"),
        jwt_audience=os.getenv("JWT_AUDIENCE", "decision-digital-twin-clients"),
        access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")),
        max_failed_logins=int(os.getenv("MAX_FAILED_LOGINS", "5")),
        lockout_minutes=int(os.getenv("LOCKOUT_MINUTES", "15")),
        password_min_length=int(os.getenv("PASSWORD_MIN_LENGTH", "10")),
        rate_limit_per_minute=int(os.getenv("RATE_LIMIT_PER_MINUTE", "120")),
        max_request_size_mb=int(os.getenv("MAX_REQUEST_SIZE_MB", "5")),
        invoice_approval_threshold=float(
            os.getenv("INVOICE_APPROVAL_THRESHOLD", "300000")
        ),
        high_value_payment_threshold=float(
            os.getenv("HIGH_VALUE_PAYMENT_THRESHOLD", "1000000")
        ),
        required_high_value_approvals=int(
            os.getenv("REQUIRED_HIGH_VALUE_APPROVALS", "2")
        ),
        database_path=os.getenv("DATABASE_PATH", "app/data/platform_state.db"),
        audit_log_path=os.getenv("AUDIT_LOG_PATH", "app/data/audit_trail.jsonl"),
        audit_hmac_key=os.getenv("AUDIT_HMAC_KEY", "change-this-audit-signing-key"),
        data_encryption_key=os.getenv(
            "DATA_ENCRYPTION_KEY",
            "change-this-fernet-key-or-passphrase",
        ),
        backup_dir=os.getenv("BACKUP_DIR", "app/data/backups"),
        backup_retention_count=int(os.getenv("BACKUP_RETENTION_COUNT", "20")),
        enable_external_ai=enable_external_ai,
        external_ai_base_url=os.getenv("EXTERNAL_AI_BASE_URL", "https://api.openai.com/v1"),
        external_ai_api_key=external_ai_api_key,
        external_ai_models=_parse_csv(
            os.getenv("EXTERNAL_AI_MODELS", ""),
            default_external_models,
        ),
        external_ai_timeout_seconds=int(os.getenv("EXTERNAL_AI_TIMEOUT_SECONDS", "20")),
        bootstrap_users=_parse_bootstrap_users(os.getenv("BOOTSTRAP_USERS_JSON", "")),
    )
