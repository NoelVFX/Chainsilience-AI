"""Billing endpoints: plan status, Stripe Checkout, verification, webhook.

Flow (mirrors the OKX Preferences logic):
  1. POST /billing/checkout   → create a Stripe Checkout session, return its URL
  2. user pays on Stripe, returns to /billing/success?session_id=...
  3. POST /billing/verify     → retrieve session, if paid → activate the plan
  4. POST /billing/webhook    → server-to-server confirmation (source of truth)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlmodel import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import get_session
from app.models.entities import User
from app.repositories import CompanyRepository
from app.services.billing import (
    activate_company,
    cancel_subscription,
    deactivate_company,
    gate_active,
    get_stripe,
    is_entitled,
    plan_line_item,
    set_cancel_flag,
    stripe_configured,
)

logger = get_logger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan: str = "growth"


class CheckoutResponse(BaseModel):
    url: str


class VerifyRequest(BaseModel):
    session_id: str


class StatusResponse(BaseModel):
    plan: str
    active: bool
    entitled: bool
    gate_enabled: bool
    stripe_configured: bool
    cancel_at_period_end: bool = False


@router.get("/status", response_model=StatusResponse)
def billing_status(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> StatusResponse:
    company = CompanyRepository(session).get(user.company_id) if user.company_id else None
    demo = user.email == settings.demo_email
    return StatusResponse(
        plan=(company.plan if company else "free"),
        active=bool(company and company.plan_active),
        entitled=demo or is_entitled(company),
        gate_enabled=gate_active(),
        stripe_configured=stripe_configured(),
        cancel_at_period_end=bool(company and company.plan_cancel_at_period_end),
    )


@router.post("/checkout", response_model=CheckoutResponse)
def create_checkout(
    payload: CheckoutRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CheckoutResponse:
    stripe = get_stripe()
    if stripe is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Payments are not configured yet. Please try again later.",
        )
    if user.company_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Complete onboarding before subscribing."
        )
    line_item = plan_line_item(payload.plan)
    if line_item is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown plan '{payload.plan}'.")

    base = settings.frontend_base_url.rstrip("/")
    try:
        checkout = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[line_item],
            customer_email=user.email,
            client_reference_id=str(user.company_id),
            metadata={"company_id": str(user.company_id), "plan": payload.plan},
            success_url=f"{base}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base}/#pricing",
            allow_promotion_codes=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Stripe checkout create failed: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not start checkout.") from exc

    return CheckoutResponse(url=checkout.url)


@router.post("/verify", response_model=StatusResponse)
def verify_checkout(
    payload: VerifyRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StatusResponse:
    """Confirm a returning checkout and activate the plan (idempotent)."""
    stripe = get_stripe()
    if stripe is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payments are not configured.")

    try:
        checkout = stripe.checkout.Session.retrieve(payload.session_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not find that checkout.") from exc

    if checkout.get("payment_status") != "paid":
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"Payment not completed (status: {checkout.get('payment_status')}).",
        )

    # Trust the company from our own client_reference_id, but only for the caller.
    ref = checkout.get("client_reference_id")
    if ref is None or (user.company_id is not None and str(user.company_id) != str(ref)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This checkout is for a different account.")

    repo = CompanyRepository(session)
    company = repo.get(int(ref))
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found.")

    plan = (checkout.get("metadata") or {}).get("plan", "growth")
    company = activate_company(
        session, company, plan=plan,
        customer_id=checkout.get("customer"),
        subscription_id=checkout.get("subscription"),
    )
    return StatusResponse(
        plan=company.plan, active=company.plan_active, entitled=is_entitled(company),
        gate_enabled=gate_active(), stripe_configured=stripe_configured(),
        cancel_at_period_end=company.plan_cancel_at_period_end,
    )


@router.post("/cancel", response_model=StatusResponse)
def cancel_plan(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> StatusResponse:
    """Cancel the current plan at the end of the billing period.

    Billing stops for the next cycle and the plan is scheduled to end; the
    company keeps access until the current paid period runs out. Idempotent —
    cancelling an already-cancelling plan is a no-op.
    """
    if user.company_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active plan to cancel.")
    repo = CompanyRepository(session)
    company = repo.get(user.company_id)
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found.")
    if not company.plan_active or company.plan not in {"growth", "enterprise"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active paid plan to cancel.")

    try:
        company = cancel_subscription(session, company)
    except Exception as exc:  # noqa: BLE001 — surface a clean message to the UI
        logger.warning("Stripe subscription cancel failed: %s", exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Could not cancel the subscription."
        ) from exc

    return StatusResponse(
        plan=company.plan, active=company.plan_active, entitled=is_entitled(company),
        gate_enabled=gate_active(), stripe_configured=stripe_configured(),
        cancel_at_period_end=company.plan_cancel_at_period_end,
    )


@router.post("/webhook")
async def stripe_webhook(request: Request, session: Session = Depends(get_session)) -> dict:
    """Source-of-truth confirmation from Stripe (signature-verified)."""
    stripe = get_stripe()
    if stripe is None or not settings.stripe_webhook_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Webhook not configured.")

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
    except Exception as exc:  # noqa: BLE001 — invalid signature / payload
        logger.warning("Stripe webhook signature verification failed: %s", exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid webhook signature.") from exc

    etype = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}
    repo = CompanyRepository(session)

    if etype == "checkout.session.completed":
        ref = obj.get("client_reference_id")
        if ref and obj.get("payment_status") == "paid":
            company = repo.get(int(ref))
            if company:
                plan = (obj.get("metadata") or {}).get("plan", "growth")
                activate_company(
                    session, company, plan=plan,
                    customer_id=obj.get("customer"), subscription_id=obj.get("subscription"),
                )
    elif etype == "customer.subscription.updated":
        # Keep the local cancel-at-period-end flag in sync with Stripe (e.g. the
        # user cancels/resumes from the Stripe portal instead of our button).
        company = repo.get_by_subscription_id(obj.get("id", ""))
        if company:
            set_cancel_flag(session, company, bool(obj.get("cancel_at_period_end")))
    elif etype == "customer.subscription.deleted":
        company = repo.get_by_subscription_id(obj.get("id", ""))
        if company:
            deactivate_company(session, company)

    return {"received": True}
