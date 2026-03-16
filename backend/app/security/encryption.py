from __future__ import annotations

import base64
import hashlib
import json
from typing import Any, Dict

from cryptography.fernet import Fernet, InvalidToken


def _normalize_key(secret: str) -> bytes:
    """
    Accepts either a Fernet-compatible key or passphrase and converts to a valid key.
    """
    candidate = secret.encode("utf-8")
    try:
        Fernet(candidate)
        return candidate
    except (ValueError, TypeError):
        digest = hashlib.sha256(candidate).digest()
        return base64.urlsafe_b64encode(digest)


class DataEncryptionService:
    def __init__(self, secret: str) -> None:
        self._fernet = Fernet(_normalize_key(secret))

    def encrypt_text(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")

    def decrypt_text(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError("Failed to decrypt payload: invalid token") from exc

    def encrypt_json(self, payload: Dict[str, Any]) -> str:
        body = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        return self.encrypt_text(body)

    def decrypt_json(self, ciphertext: str) -> Dict[str, Any]:
        body = self.decrypt_text(ciphertext)
        data = json.loads(body)
        if not isinstance(data, dict):
            raise ValueError("Decrypted payload is not a JSON object")
        return data

