"""Transactional email delivery.

A single tiny surface — :func:`send_otp_email` — used by the sign-up flow. When
SMTP is configured (``SMTP_HOST`` + ``SMTP_USER`` + ``SMTP_PASSWORD``) the code
is delivered over STARTTLS/SSL. When it is not, the mailer degrades gracefully:
it logs the code server-side and reports that nothing was delivered, so the
caller can surface a dev code and the whole flow stays testable with zero email
infrastructure.
"""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def smtp_configured() -> bool:
    """True when enough SMTP settings are present to attempt a real send."""
    return bool(settings.smtp_host and settings.smtp_user and settings.smtp_password)


def _from_header() -> str:
    """The 'From' header: the app name as display name + the sender address.

    The address is SMTP_FROM (falling back to SMTP_USER). Note: for Gmail the
    sending address must match the authenticated account, so set SMTP_USER to
    the same mailbox you want messages to come from.
    """
    address = settings.smtp_from or settings.smtp_user or ""
    return f"{settings.app_name} <{address}>"


def _dispatch(to_email: str, subject: str, body: str, log_label: str, dev_line: str) -> bool:
    """Send one plaintext email, or dev-log it when SMTP isn't configured.

    Returns True if actually sent via SMTP, False on the dev-log fallback.
    """
    if not smtp_configured():
        logger.info("[%s] (dev — no SMTP configured) %s", log_label, dev_line)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = _from_header()
    msg["To"] = to_email
    msg.set_content(body)

    try:
        if settings.smtp_use_tls:
            context = ssl.create_default_context()
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls(context=context)
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        logger.info("[%s] sent email to %s via SMTP", log_label, to_email)
        return True
    except Exception as exc:  # noqa: BLE001 — never let email failure break the flow
        logger.warning(
            "[%s] SMTP send to %s failed (%s); falling back to dev log", log_label, to_email, exc
        )
        logger.info("[%s] (dev fallback) %s", log_label, dev_line)
        return False


def send_password_reset_email(to_email: str, reset_url: str) -> bool:
    """Email a password-reset link. Returns True if actually sent via SMTP."""
    minutes = max(1, settings.reset_token_ttl_seconds // 60)
    subject = f"Reset your {settings.app_name} password"
    body = (
        f"We received a request to reset your {settings.app_name} password.\n\n"
        f"Reset it here (link valid for {minutes} minutes):\n\n"
        f"    {reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email — your "
        f"password won't change."
    )
    return _dispatch(
        to_email,
        subject,
        body,
        log_label="RESET",
        dev_line=f"reset link for {to_email}: {reset_url}",
    )


def send_otp_email(to_email: str, code: str) -> bool:
    """Email a verification ``code`` to ``to_email``.

    Returns ``True`` if the message was actually dispatched via SMTP, ``False``
    if it fell back to dev-logging (no SMTP configured, or the send failed).
    """
    minutes = max(1, settings.otp_ttl_seconds // 60)
    subject = f"Your {settings.app_name} verification code"
    body = (
        f"Your {settings.app_name} verification code is:\n\n"
        f"    {code}\n\n"
        f"Enter it to finish setting up your account. The code expires in "
        f"{minutes} minutes.\n\n"
        f"If you didn't request this, you can safely ignore this email."
    )

    if not smtp_configured():
        logger.info("[OTP] (dev — no SMTP configured) code for %s is %s", to_email, code)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = _from_header()
    msg["To"] = to_email
    msg.set_content(body)

    try:
        if settings.smtp_use_tls:
            context = ssl.create_default_context()
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls(context=context)
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        logger.info("[OTP] sent verification code to %s via SMTP", to_email)
        return True
    except Exception as exc:  # noqa: BLE001 — never let email failure break sign-up
        logger.warning(
            "[OTP] SMTP send to %s failed (%s); falling back to dev log", to_email, exc
        )
        logger.info("[OTP] (dev fallback) code for %s is %s", to_email, code)
        return False
