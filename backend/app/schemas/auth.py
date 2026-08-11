"""Request/response schemas for authentication and the current user."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.models.entities import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = ""
    company_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    # Always the same generic message so the endpoint never reveals whether an
    # account exists for the address.
    message: str
    # Only populated outside production when SMTP isn't configured, so the reset
    # flow stays testable without real email infrastructure.
    dev_reset_url: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16)
    new_password: str = Field(min_length=6)


class ResetPasswordResponse(BaseModel):
    reset: bool


class RequestOtpRequest(BaseModel):
    email: EmailStr


class RequestOtpResponse(BaseModel):
    sent: bool
    delivered: bool  # True if actually emailed; False if dev-logged only
    expires_in: int  # seconds until the code expires
    # Only populated outside production when email delivery isn't configured,
    # so the sign-up flow remains testable without real email infrastructure.
    dev_code: str | None = None


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)


class VerifyOtpResponse(BaseModel):
    verified: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    company_id: int | None = None

    model_config = {"from_attributes": True}


TokenResponse.model_rebuild()
