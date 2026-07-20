"""Risk endpoints: list, detail, and AI mitigation-email generation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.core.constants import severity_color, severity_label
from app.core.timeutil import relative_time
from app.db.session import get_session
from app.models.entities import Risk
from app.repositories import RiskRepository
from app.schemas.domain import (
    EmailRequest,
    EmailResponse,
    Factor,
    ImpactTile,
    RiskCard,
    RiskDetailResponse,
)
from app.services.email_gen import EmailService

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
    return RiskDetailResponse(
        id=r.id, title=r.headline or r.title, headline=r.headline or r.title,
        severity=severity_label(r.severity).upper(), severity_color=severity_color(r.severity),
        score=r.score, confidence=r.confidence, time=relative_time(r.created_at),
        reasoning=r.reasoning,
        factors=[Factor(**f) for f in r.factors],
        impact=[ImpactTile(**i) for i in r.impact],
        chain=r.chain,
    )


@router.post("/{risk_id}/email", response_model=EmailResponse)
def generate_email(
    risk_id: int,
    payload: EmailRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> EmailResponse:
    r = _load_risk(risk_id, company_id, session)
    subject, body = EmailService().generate(r, payload.kind)
    return EmailResponse(subject=subject, body=body, kind=payload.kind)
