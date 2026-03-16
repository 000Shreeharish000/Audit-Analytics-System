from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
from uuid import uuid4

from jose import JWTError, jwt

from app.config import Settings


class PasswordPolicyError(ValueError):
    pass


def _hash_password(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 390000)
    return base64.b64encode(digest).decode("utf-8")


def validate_password_strength(password: str, min_length: int) -> None:
    if len(password) < min_length:
        raise PasswordPolicyError(f"Password must be at least {min_length} characters long")
    if not re.search(r"[A-Z]", password):
        raise PasswordPolicyError("Password must include at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise PasswordPolicyError("Password must include at least one lowercase letter")
    if not re.search(r"\d", password):
        raise PasswordPolicyError("Password must include at least one digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise PasswordPolicyError("Password must include at least one special character")


def create_password_hash(password: str) -> str:
    salt = os.urandom(16)
    salt_b64 = base64.b64encode(salt).decode("utf-8")
    digest = _hash_password(password, salt)
    return f"{salt_b64}${digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_b64, digest = password_hash.split("$", 1)
        salt = base64.b64decode(salt_b64.encode("utf-8"))
    except ValueError:
        return False
    candidate = _hash_password(password, salt)
    return hmac.compare_digest(candidate, digest)


def authenticate_user(
    username: str,
    password: str,
    user_record: Optional[Dict[str, str]],
) -> Optional[Dict[str, str]]:
    if not user_record or int(user_record.get("is_active", 0)) != 1:
        return None
    if not verify_password(password, user_record["password_hash"]):
        return None
    return {"username": username, "role": user_record["role"]}


def create_access_token(
    data: Dict[str, str],
    settings: Settings,
    expires_delta: Optional[timedelta] = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode = data.copy()
    to_encode.update(
        {
            "exp": expire,
            "iat": now,
            "nbf": now,
            "jti": str(uuid4()),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        }
    )
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> Dict[str, str]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        return {"username": payload.get("sub", ""), "role": payload.get("role", "")}
    except JWTError as exc:
        raise ValueError("Invalid token") from exc

