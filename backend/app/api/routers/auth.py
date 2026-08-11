"""Authentication endpoints: register, login, email OTP, current user."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_otp_code,
    generate_reset_token,
    hash_otp,
    hash_password,
    hash_token,
    verify_otp_hash,
    verify_password,
)
from app.db.session import get_session
from app.models.entities import Company, User, UserRole
from app.repositories import (
    CompanyRepository,
    EmailOtpRepository,
    PasswordResetTokenRepository,
    UserRepository,
)
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RegisterRequest,
    RequestOtpRequest,
    RequestOtpResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    TokenResponse,
    UserResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.services.mailer import send_otp_email, send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])


def _norm_email(email: str) -> str:
    """Canonical form for OTP lookups so request/verify/register always agree."""
    return email.strip().lower()


def _is_expired(expires_at: datetime) -> bool:
    """Compare an expiry against now, tolerating naive (SQLite/Postgres) values."""
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        now = now.replace(tzinfo=None)
    return expires_at < now


@router.post("/request-otp", response_model=RequestOtpResponse)
def request_otp(
    payload: RequestOtpRequest, session: Session = Depends(get_session)
) -> RequestOtpResponse:
    """Email a fresh 6-digit verification code for a pending sign-up.

    Rejects addresses that already have an account so the caller can steer the
    user to sign in instead. Any previous code for the address is invalidated.
    """
    email = _norm_email(payload.email)
    if UserRepository(session).get_by_email(email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    code = generate_otp_code()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.otp_ttl_seconds)
    EmailOtpRepository(session).replace_for_email(email, hash_otp(code), expires_at)

    delivered = send_otp_email(email, code)
    dev_code = code if (not delivered and settings.environment != "production") else None
    return RequestOtpResponse(
        sent=True,
        delivered=delivered,
        expires_in=settings.otp_ttl_seconds,
        dev_code=dev_code,
    )


@router.post("/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(
    payload: VerifyOtpRequest, session: Session = Depends(get_session)
) -> VerifyOtpResponse:
    """Check a submitted code, marking the email verified so it may register."""
    email = _norm_email(payload.email)
    repo = EmailOtpRepository(session)
    otp = repo.get_by_email(email)

    if otp is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No verification code found. Please request a new one.",
        )
    if _is_expired(otp.expires_at):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Verification code expired. Please request a new one.",
        )
    if otp.attempts >= settings.otp_max_attempts:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many attempts. Please request a new code.",
        )
    if not verify_otp_hash(payload.code.strip(), otp.code_hash):
        otp.attempts += 1
        repo.save(otp)
        remaining = max(0, settings.otp_max_attempts - otp.attempts)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Incorrect code. {remaining} attempt(s) left.",
        )

    # Correct: mark verified and refresh the window so the follow-up register
    # call (moments later) still finds a live, verified code.
    otp.verified = True
    otp.expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.otp_ttl_seconds)
    repo.save(otp)
    return VerifyOtpResponse(verified=True)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, session: Session = Depends(get_session)) -> TokenResponse:
    users = UserRepository(session)
    if users.get_by_email(payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    # Gate: the email must have passed OTP verification first.
    otp_repo = EmailOtpRepository(session)
    otp = otp_repo.get_by_email(_norm_email(payload.email))
    if otp is None or not otp.verified or _is_expired(otp.expires_at):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Email not verified. Please verify the code sent to your email.",
        )

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
    # Verification consumed — the code can't be replayed for another account.
    otp_repo.delete_for_email(_norm_email(payload.email))
    token = create_access_token(user.id, {"role": user.role.value})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    user = UserRepository(session).get_by_email(payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    token = create_access_token(user.id, {"role": user.role.value})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


_GENERIC_RESET_MESSAGE = "If an account exists for that email, a reset link has been sent."


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest, session: Session = Depends(get_session)
) -> ForgotPasswordResponse:
    """Email a password-reset link.

    Always returns the same generic message so the response never reveals
    whether an account exists. When a user is found, a single-use token is
    generated (superseding any prior one) and a reset link is emailed.
    """
    email = _norm_email(payload.email)
    user = UserRepository(session).get_by_email(email)

    dev_reset_url: str | None = None
    if user is not None:
        raw_token = generate_reset_token()
        expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=settings.reset_token_ttl_seconds
        )
        PasswordResetTokenRepository(session).replace_for_user(
            user.id, hash_token(raw_token), expires_at
        )
        reset_url = f"{settings.frontend_base_url.rstrip('/')}/reset-password?token={raw_token}"
        delivered = send_password_reset_email(email, reset_url)
        if not delivered and settings.environment != "production":
            dev_reset_url = reset_url

    return ForgotPasswordResponse(message=_GENERIC_RESET_MESSAGE, dev_reset_url=dev_reset_url)


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(
    payload: ResetPasswordRequest, session: Session = Depends(get_session)
) -> ResetPasswordResponse:
    """Set a new password given a valid, unexpired reset token."""
    repo = PasswordResetTokenRepository(session)
    row = repo.get_by_hash(hash_token(payload.token.strip()))
    if row is None or _is_expired(row.expires_at):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This reset link is invalid or has expired. Please request a new one.",
        )

    users = UserRepository(session)
    user = users.get(row.user_id)
    if user is None:
        repo.delete(row)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This reset link is invalid or has expired. Please request a new one.",
        )

    user.hashed_password = hash_password(payload.new_password)
    users.update(user)
    repo.delete(row)  # single-use: consume the token
    return ResetPasswordResponse(reset=True)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(user)
