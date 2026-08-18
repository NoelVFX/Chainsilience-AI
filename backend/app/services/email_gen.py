"""AI Email Generator (spec module 5 + 13).

Drafts supplier / customer / executive / procurement communications for a risk.
Uses the LLM when configured, otherwise a professional template — always
returning an editable draft (never auto-sent; sending is out of scope for MVP).
"""
from __future__ import annotations

from app.models.entities import Risk
from app.services.ai.adapter import ai_client

_TEMPLATES = {
    "customer": (
        "Proactive update on your upcoming {product} orders",
        "Dear valued customer,\n\nWe are writing to proactively inform you of a "
        "supply chain event — {title} — that may affect delivery timelines for "
        "{product}. Our team has already activated mitigation measures, including "
        "alternate sourcing and expedited logistics, and we currently estimate any "
        "impact to be limited.\n\nWe will keep you updated as the situation evolves "
        "and remain committed to meeting your requirements.\n\nBest regards,\n"
        "Supply Chain Operations",
    ),
    "supplier": (
        "Urgent: capacity and contingency for {product} components",
        "Hello,\n\nFollowing {title}, we are reviewing continuity of supply for "
        "components feeding {product}. Please confirm your current capacity, lead "
        "times, and any contingency options at the earliest opportunity so we can "
        "coordinate a joint response.\n\nThank you,\nProcurement",
    ),
    "executive": (
        "Executive brief: {title}",
        "Summary: {title} presents a {severity} risk (score {score}/100) with an "
        "estimated ${revenue} in revenue exposure. Recommended immediate action is "
        "customer notification, with a supplier switch as the highest-impact "
        "mitigation. Detailed scenarios are available in the platform.\n\n"
        "— Chainsilience AI",
    ),
    "procurement": (
        "Procurement request: expedite alternate sourcing for {product}",
        "Team,\n\nPlease initiate expedited sourcing for components affected by "
        "{title}. Prioritise qualified alternates and request rush quotations. "
        "Target: restore coverage within three weeks.\n\nThanks,\nSupply Chain",
    ),
}


class EmailService:
    def generate(self, risk: Risk, kind: str = "customer") -> tuple[str, str]:
        kind = kind if kind in _TEMPLATES else "customer"
        product = self._primary_product(risk)
        context = {
            "kind": kind,
            "title": risk.title,
            "severity": risk.severity.value,
            "score": risk.score,
            "revenue": f"{risk.revenue_at_risk:,.0f}",
            "product": product,
        }

        subject, body = ai_client.generate_email(kind, context)
        if subject and body:
            return subject, body

        subj_tpl, body_tpl = _TEMPLATES[kind]
        return (
            subj_tpl.format(**context),
            body_tpl.format(**context),
        )

    @staticmethod
    def _primary_product(risk: Risk) -> str:
        for node in risk.chain:
            if node.startswith("Product:"):
                return node.split(":", 1)[1].strip()
        return "your products"
