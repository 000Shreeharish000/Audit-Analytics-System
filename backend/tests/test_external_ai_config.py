from __future__ import annotations

from app.config import load_settings


def _clear_external_ai_env(monkeypatch) -> None:
    for key in ("ENABLE_EXTERNAL_AI", "OPENAI_API_KEY", "EXTERNAL_AI_API_KEY"):
        monkeypatch.delenv(key, raising=False)


def test_openai_api_key_auto_enables_external_ai(monkeypatch) -> None:
    _clear_external_ai_env(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-openai")

    settings = load_settings()

    assert settings.external_ai_api_key == "sk-test-openai"
    assert settings.enable_external_ai is True


def test_explicit_disable_overrides_present_openai_key(monkeypatch) -> None:
    _clear_external_ai_env(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-openai")
    monkeypatch.setenv("ENABLE_EXTERNAL_AI", "false")

    settings = load_settings()

    assert settings.external_ai_api_key == "sk-test-openai"
    assert settings.enable_external_ai is False


def test_external_ai_api_key_takes_precedence_over_openai_alias(monkeypatch) -> None:
    _clear_external_ai_env(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-alias")
    monkeypatch.setenv("EXTERNAL_AI_API_KEY", "sk-explicit-external")
    monkeypatch.setenv("ENABLE_EXTERNAL_AI", "auto")

    settings = load_settings()

    assert settings.external_ai_api_key == "sk-explicit-external"
    assert settings.enable_external_ai is True
