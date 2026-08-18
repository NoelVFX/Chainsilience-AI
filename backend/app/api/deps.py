"""Shared FastAPI dependencies: DB session, current user, current company.

Bearer-token auth: the JWT ``sub`` claim carries the user id, resolved to a
``User`` on each request. ``get_current_company_id`` enforces that the caller is
attached to a company (all domain resources are company-scoped).
"""
from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.core.security import decode_access_token
from app.db.session import get_session
from app.models.entities import User
from app.repositories import UserRepository

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Session:  # thin alias for clarity in signatures
    yield from get_session()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc

    user = UserRepository(session).get(user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    return user


def get_current_company_id(user: User = Depends(get_current_user)) -> int:
    if user.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no company. Complete onboarding first.",
        )
    return user.company_id


def require_entitlement(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """Gate the platform behind a paid plan (HTTP 402 when unentitled).

    No-op unless the billing gate is active (Stripe configured + REQUIRE_PAYMENT).
    The demo account is always exempt so the public demo stays free.
    """
    from app.core.config import settings
    from app.repositories import CompanyRepository
    from app.services.billing import gate_active, is_entitled

    if not gate_active():
        return
    if user.email == settings.demo_email:  # public demo — never gated
        return
    company = CompanyRepository(session).get(user.company_id) if user.company_id else None
    if not is_entitled(company):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="A paid plan is required to access the platform.",
        )
