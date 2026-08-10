"""Authentication primitives: password hashing and JWT access tokens.

Uses PBKDF2-SHA256 (pure-python, no native build step) for portability across
Windows/macOS/Linux and PyJWT for stateless bearer tokens.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from app.core.config import settings

_pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return a salted PBKDF2-SHA256 hash for a plaintext password."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time verification of a plaintext password against its hash."""
    return _pwd_context.verify(plain, hashed)


def generate_otp_code(length: int | None = None) -> str:
    """Return a cryptographically-random numeric one-time code (zero-padded)."""
    n = length or settings.otp_length
    return f"{secrets.randbelow(10 ** n):0{n}d}"


def hash_otp(code: str) -> str:
    """Keyed HMAC-SHA256 of an OTP so the plaintext code is never persisted."""
    return hmac.new(settings.secret_key.encode(), code.encode(), hashlib.sha256).hexdigest()


def verify_otp_hash(code: str, hashed: str) -> bool:
    """Constant-time comparison of a submitted code against its stored hash."""
    return hmac.compare_digest(hash_otp(code), hashed)


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    """Mint a signed JWT for ``subject`` (typically the user id)."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT, raising ``jwt.PyJWTError`` on failure."""
    return jwt.decode(
        token, settings.secret_key, algorithms=[settings.jwt_algorithm]
    )
