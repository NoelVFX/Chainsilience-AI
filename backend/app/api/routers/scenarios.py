"""Scenario simulator endpoints: simulate strategies and approve one."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.db.session import get_session
from app.models.entities import Action, ActionStatus, Severity
from app.repositories import ActionRepository, RiskRepository
from app.schemas.domain import (
    ApproveScenarioRequest,
    ScenarioResponse,
    ScenarioTile,
)
from app.services.recommendations import RecommendationService
from app.services.scenario import ScenarioService

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("/{risk_id}", response_model=ScenarioResponse)
def simulate(
    risk_id: int,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> ScenarioResponse:
    risk = RiskRepository(session).get(risk_id)
    if not risk or risk.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Risk not found")
    scenarios = ScenarioService().simulate(risk)
    return ScenarioResponse(
        risk_id=risk.id,
        risk_title=risk.headline or risk.title,
        scenarios=[ScenarioTile(**s) for s in scenarios],
    )


@router.post("/{risk_id}/approve")
def approve(
    risk_id: int,
    payload: ApproveScenarioRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Approve a scenario → send it to the Action Center.

    Rules:
      * Approving the **same scenario** twice is rejected ("already approved").
      * On first approval, the event's AI recommendations are generated into the
        **Recommended** column (recommendations only appear once a scenario for
        the event has been approved).
    """
    risk = RiskRepository(session).get(risk_id)
    if not risk or risk.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Risk not found")

    scenario = ScenarioService().get(risk, payload.scenario_id)
    if not scenario:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown scenario")

    repo = ActionRepository(session)
    title = f"{scenario['name']} — {risk.title}"

    # Reject a duplicate approval of the same scenario.
    if repo.exists_title(company_id, title):
        return {
            "approved": False,
            "status": "already_approved",
            "message": f"“{scenario['name']}” is already approved and in the Action Center.",
        }

    action = repo.add(
        Action(
            company_id=company_id, risk_id=risk.id, title=title,
            owner="Procurement", deadline="",
            priority=Severity.CRITICAL if risk.severity == Severity.CRITICAL else Severity.HIGH,
            status=ActionStatus.APPROVED,
            estimated_benefit=f"{scenario['risk_reduction']} risk reduction",
            estimated_cost=scenario["cost"], department="Procurement",
        )
    )

    # Now that a scenario is approved, surface this event's recommendations in
    # the Recommended column (deduped).
    recommended = 0
    for rec in RecommendationService(ScenarioService()).recommend(risk):
        saved = repo.add_unique(
            Action(
                company_id=company_id, risk_id=risk.id, title=rec.title,
                owner=rec.department, deadline=rec.deadline, priority=rec.priority,
                status=ActionStatus.RECOMMENDED,
                estimated_benefit=rec.estimated_benefit,
                estimated_cost=rec.estimated_cost, department=rec.department,
            )
        )
        if saved:
            recommended += 1

    return {
        "approved": True,
        "status": action.status.value,
        "action_id": action.id,
        "recommended_added": recommended,
        "message": f"Approved. {recommended} recommended action(s) added.",
    }
