"""Reports endpoint (AI module 6) — executive risk briefing."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.db.session import get_session
from app.repositories import CompanyRepository, RiskRepository
from app.services.ai.adapter import ai_client

router = APIRouter(prefix="/reports", tags=["reports"])


class ExecutiveReport(BaseModel):
    company: str
    generated_summary: str
    top_risks: list[str]


@router.get("/executive", response_model=ExecutiveReport)
def executive_report(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> ExecutiveReport:
    company = CompanyRepository(session).get(company_id)
    risks = RiskRepository(session).for_company(company_id)[:5]
    top = [f"{r.title} — {r.severity.value} (score {r.score})" for r in risks]

    total_revenue = sum(r.revenue_at_risk for r in risks)
    fallback = (
        f"{company.name if company else 'The company'} currently faces "
        f"{len(risks)} notable supply-chain risks with an estimated "
        f"${total_revenue:,.0f} in combined revenue exposure. The highest-priority "
        f"item is '{risks[0].title}'. Recommended focus: customer notification and "
        f"the top-ranked mitigation scenario."
        if risks
        else "No significant supply-chain risks detected."
    )
    summary = ai_client.executive_report(
        {"company": company.name if company else "", "top_risks": top,
         "fallback_report": fallback}
    )
    return ExecutiveReport(
        company=company.name if company else "",
        generated_summary=summary or fallback,
        top_risks=top,
    )
