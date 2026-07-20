"""Authentication endpoints: register, login, forgot-password, current user."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_session
from app.models.entities import Company, User, UserRole
from app.repositories import CompanyRepository, UserRepository
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, session: Session = Depends(get_session)) -> TokenResponse:
    users = UserRepository(session)
    if users.get_by_email(payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    company_id: int | None = None
    if payload.company_name:
        company = CompanyRepository(session).add(Company(name=payload.company_name))
        company_id = company.id

    user = users.add(
        User(
            email=payload.email,
            full_name=payload.full_name,
            hashed_password=hash_password(payload.password),
            role=UserRole.ADMINISTRATOR if company_id else UserRole.MANAGER,
            company_id=company_id,
        )
    )
    token = create_access_token(user.id, {"role": user.role.value})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    user = UserRepository(session).get_by_email(payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    token = create_access_token(user.id, {"role": user.role.value})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest) -> dict:
    # MVP: always return success without leaking whether the email exists.
    # A production build would enqueue a reset email via the alert system.
    return {"message": "If an account exists, a reset link has been sent."}


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(user)
