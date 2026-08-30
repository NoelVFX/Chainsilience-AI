"""Billing / entitlement via Stripe Checkout.

Mirrors the OKX Preferences pattern: create a Checkout session, verify its
``payment_status`` is ``paid``, then persist a paid flag — here as a plan on the
company. Degrades gracefully: with no ``STRIPE_SECRET_KEY`` the gate is inactive
and checkout can't be created, so the app runs exactly as before.
"""
from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.models.entities import Company

logger = get_logger(__name__)

# Paid tiers that grant platform access.
PAID_PLANS = {"growth", "enterprise"}


def stripe_configured() -> bool:
    return bool(settings.stripe_secret_key)


def gate_active() -> bool:
    """The entitlement gate enforces only when Stripe is configured AND the
    REQUIRE_PAYMENT toggle is on. Otherwise the platform is open (unchanged)."""
    return stripe_configured() and settings.require_payment


def get_stripe() -> Any | None:
    """Return a configured Stripe module, or None when no key is set."""
    if not stripe_configured():
        return None
    import stripe

    stripe.api_key = settings.stripe_secret_key
    return stripe


def is_entitled(company: Company | None) -> bool:
    """True if the company holds an active paid plan."""
    if company is None:
        return False
    return bool(company.plan in PAID_PLANS and company.plan_active)


# --- Plan catalog (inline price_data — no pre-created Stripe Price IDs) --------
def plan_line_item(plan: str) -> dict[str, Any] | None:
    """The Stripe Checkout line item for a purchasable plan, or None."""
    if plan == "growth":
        return {
            "price_data": {
                "currency": settings.stripe_currency,
                "product_data": {
                    "name": "Chainsilience AI — Growth",
                    "description": "Real-time supply-chain risk intelligence for one organisation.",
                },
                "unit_amount": settings.stripe_growth_price_cents,
                "recurring": {"interval": "month"},
            },
            "quantity": 1,
        }
    return None


def activate_company(session, company: Company, *, plan: str, customer_id: str | None,
                     subscription_id: str | None) -> Company:
    """Mark a company as holding an active paid plan (idempotent)."""
    from app.repositories import CompanyRepository

    company.plan = plan
    company.plan_active = True
    # A fresh activation clears any prior pending cancellation.
    company.plan_cancel_at_period_end = False
    if customer_id:
        company.stripe_customer_id = customer_id
    if subscription_id:
        company.stripe_subscription_id = subscription_id
    updated = CompanyRepository(session).update(company)
    logger.info("Billing: activated company %s on plan '%s'", company.id, plan)
    return updated


def deactivate_company(session, company: Company) -> Company:
    """Revoke access (e.g. subscription fully cancelled at period end)."""
    from app.repositories import CompanyRepository

    company.plan = "free"
    company.plan_active = False
    company.plan_cancel_at_period_end = False
    company.stripe_subscription_id = None
    updated = CompanyRepository(session).update(company)
    logger.info("Billing: deactivated company %s", company.id)
    return updated


def cancel_subscription(session, company: Company) -> Company:
    """Cancel at period end: stop billing next cycle, keep access until then.

    Sets Stripe's ``cancel_at_period_end`` on the live subscription so no further
    charges occur, while the company keeps its plan for the rest of the paid
    period. Full deactivation happens later via the ``customer.subscription.deleted``
    webhook when the period actually ends.
    """
    from app.repositories import CompanyRepository

    stripe = get_stripe()
    if stripe is not None and company.stripe_subscription_id:
        # Let a Stripe error propagate to the caller so the UI can report it.
        stripe.Subscription.modify(
            company.stripe_subscription_id, cancel_at_period_end=True
        )
    company.plan_cancel_at_period_end = True
    updated = CompanyRepository(session).update(company)
    logger.info("Billing: scheduled cancellation for company %s at period end", company.id)
    return updated


def set_cancel_flag(session, company: Company, cancel: bool) -> Company:
    """Sync the local cancel-at-period-end flag (e.g. from a Stripe webhook)."""
    from app.repositories import CompanyRepository

    company.plan_cancel_at_period_end = bool(cancel)
    return CompanyRepository(session).update(company)
