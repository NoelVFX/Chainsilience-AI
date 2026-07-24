"""Risk endpoints: list, detail, and AI mitigation-email generation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.core.constants import severity_color, severity_label
from app.core.timeutil import relative_time
from app.db.session import get_session
from app.models.entities import Risk
from app.repositories import EmailDraftRepository, RiskRepository, TwinRepository
from app.schemas.domain import (
    EmailRequest,
    EmailResponse,
    EmailSaveRequest,
    Factor,
    ImpactTile,
    RiskCard,
    RiskDetailResponse,
)
from app.services.email_gen import EmailService
from app.services.monte_carlo import MonteCarloService

router = APIRouter(prefix="/risks", tags=["risks"])


def _card(r: Risk) -> RiskCard:
    from app.services.dashboard import _fmt_money  # local import avoids cycle

    return RiskCard(
        id=r.id, title=r.title, supplier=r.supplier,
        severity=severity_label(r.severity), severity_color=severity_color(r.severity),
        impact=f"{_fmt_money(r.revenue_at_risk)} at risk", time=relative_time(r.created_at),
    )


@router.get("", response_model=list[RiskCard])
def list_risks(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> list[RiskCard]:
    return [_card(r) for r in RiskRepository(session).for_company(company_id)]


def _load_risk(risk_id: int, company_id: int, session: Session) -> Risk:
    risk = RiskRepository(session).get(risk_id)
    if not risk or risk.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Risk not found")
    return risk


@router.get("/{risk_id}", response_model=RiskDetailResponse)
def risk_detail(
    risk_id: int,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> RiskDetailResponse:
    r = _load_risk(risk_id, company_id, session)

    # Normalise legacy tile labels stored in older risk records / AI output, so
    # renamed metrics show correctly regardless of what's persisted.
    label_map = {"Revenue Loss": "Revenue at Risk", "Inventory Depletion": "Inventory Coverage"}
    impact = [
        {**t, "label": label_map.get(t.get("label", ""), t.get("label", ""))}
        for t in (r.impact or [])
    ]

    # Append a Monte Carlo production-stoppage probability (10k simulated
    # scenarios), unless one is present. Inputs come from this risk's stored
    # metrics, falling back to the supplier's real Digital Twin attributes so
    # each disruption yields its own probability.
    if not any(t.get("label") == "Production Stoppage" for t in impact):
        mc = MonteCarloService()
        twin = TwinRepository(session)
        supplier_attrs, coverage_hint = mc.twin_context(
            twin.nodes(company_id), twin.edges(company_id), r.supplier
        )
        impact.append(mc.stoppage_tile(r, supplier_attrs, coverage_hint))

    return RiskDetailResponse(
        id=r.id, title=r.headline or r.title, headline=r.headline or r.title,
        severity=severity_label(r.severity).upper(), severity_color=severity_color(r.severity),
        score=r.score, confidence=r.confidence, time=relative_time(r.created_at),
        reasoning=r.reasoning,
        factors=[Factor(**f) for f in r.factors],
        impact=[ImpactTile(**i) for i in impact],
        chain=r.chain,
    )


@router.post("/{risk_id}/email", response_model=EmailResponse)
def get_or_generate_email(
    risk_id: int,
    payload: EmailRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> EmailResponse:
    """Return the saved draft for (risk, kind) if one exists; otherwise draft a
    fresh one with the AI (without persisting it until the user saves)."""
    r = _load_risk(risk_id, company_id, session)
    saved = EmailDraftRepository(session).get(company_id, risk_id, payload.kind)
    if saved:
        return EmailResponse(subject=saved.subject, body=saved.body, kind=payload.kind, saved=True)
    subject, body = EmailService().generate(r, payload.kind)
    return EmailResponse(subject=subject, body=body, kind=payload.kind, saved=False)


@router.put("/{risk_id}/email", response_model=EmailResponse)
def save_email_draft(
    risk_id: int,
    payload: EmailSaveRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> EmailResponse:
    """Persist the user's edited draft so reopening loads exactly what they saved."""
    _load_risk(risk_id, company_id, session)
    draft = EmailDraftRepository(session).upsert(
        company_id, risk_id, payload.kind, payload.subject, payload.body
    )
    return EmailResponse(subject=draft.subject, body=draft.body, kind=draft.kind, saved=True)
