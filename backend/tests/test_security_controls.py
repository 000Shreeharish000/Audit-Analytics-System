from __future__ import annotations

from pathlib import Path

from app.config import load_settings
from app.security.audit_logger import AuditLogger
from app.security.auth_handler import PasswordPolicyError, validate_password_strength
from app.security.encryption import DataEncryptionService


def test_encryption_round_trip() -> None:
    service = DataEncryptionService("integration-test-secret")
    payload = {"case_id": "CASE-001", "amount": 12345}
    ciphertext = service.encrypt_json(payload)
    decrypted = service.decrypt_json(ciphertext)
    assert decrypted == payload


def test_audit_chain_integrity(tmp_path: Path) -> None:
    audit_file = tmp_path / "audit.jsonl"
    logger = AuditLogger(str(audit_file), "audit-signing-secret")
    logger.log("event_one", actor="tester", details={"k": "v"})
    logger.log("event_two", actor="tester", details={"n": 2})
    status = logger.verify_chain()
    assert status["valid"] is True
    assert status["checked_events"] == 2


def test_password_policy_rejects_weak_password() -> None:
    settings = load_settings()
    try:
        validate_password_strength("weak", settings.password_min_length)
    except PasswordPolicyError:
        return
    raise AssertionError("Expected PasswordPolicyError for weak password")
