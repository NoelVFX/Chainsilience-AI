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
    msg["From"] = settings.smtp_from or settings.smtp_user
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
