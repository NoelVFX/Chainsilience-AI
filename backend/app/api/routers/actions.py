"""Action Center endpoints: Kanban board, status transitions, and the
mitigation feedback loop (completing a mitigation reduces the linked risk)."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.core.constants import severity_color, severity_label
from app.core.logging import get_logger
from app.db.session import get_session
from app.models.entities import Action, ActionStatus
from app.repositories import ActionRepository, RiskRepository
from app.schemas.domain import (
    ActionBoardResponse,
    ActionCard,
    ActionColumn,
    MoveActionRequest,
)
from app.services.risk_scoring import RiskScoringService

logger = get_logger(__name__)

router = APIRouter(prefix="/actions", tags=["actions"])

# Ordered columns for the 5-stage workflow.
_COLUMNS: list[tuple[ActionStatus, str]] = [
    (ActionStatus.RECOMMENDED, "Recommended"),
    (ActionStatus.APPROVED, "Approved"),
    (ActionStatus.ASSIGNED, "Assigned"),
    (ActionStatus.IN_PROGRESS, "In Progress"),
    (ActionStatus.COMPLETED, "Completed"),
]


def _card(a: Action) -> ActionCard:
    return ActionCard(
        id=a.id, title=a.title, owner=a.owner, deadline=a.deadline,
        priority=severity_label(a.priority).upper(),
        priority_color=severity_color(a.priority), status=a.status,
    )


@router.get("", response_model=ActionBoardResponse)
def board(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> ActionBoardResponse:
    actions = ActionRepository(session).for_company(company_id)
    by_status: dict[ActionStatus, list[ActionCard]] = {s: [] for s, _ in _COLUMNS}
    for a in actions:
        by_status.setdefault(a.status, []).append(_card(a))
    return ActionBoardResponse(
        columns=[
            ActionColumn(key=s, name=name, items=by_status.get(s, []))
            for s, name in _COLUMNS
        ]
    )


def _apply_mitigation_effect(session: Session, action: Action) -> None:
    """Reduce the linked risk's metrics when a mitigation completes.

    The reduction comes from the action's own estimated benefit (e.g.
    "64% risk reduction"); actions without a quantified benefit apply a modest
    5% improvement (any completed mitigation helps a little). Severity is
    re-banded from the new score, and the change is noted in the reasoning so
    the AI narrative stays consistent with the numbers.
    """
    if not action.risk_id:
        return
    risk = RiskRepository(session).get(action.risk_id)
    if not risk:
        return

    m = re.search(r"(\d{1,3})\s*%", action.estimated_benefit or "")
    pct = min(95, int(m.group(1))) / 100 if m else 0.05

    old_score, old_rev = risk.score, risk.revenue_at_risk
    risk.score = max(0, round(risk.score * (1 - pct)))
    risk.revenue_at_risk = max(0.0, risk.revenue_at_risk * (1 - pct))
    risk.severity = RiskScoringService._band(risk.score)
    note = (
        f" [Mitigation completed: “{action.title}” — risk reduced by "
        f"{int(pct * 100)}% (score {old_score}→{risk.score})]"
    )
    risk.reasoning = (risk.reasoning or "") + note
    session.add(risk)
    session.commit()
    logger.info(
        "Mitigation %s completed: risk %s score %s->%s, revenue %.0f->%.0f",
        action.id, risk.id, old_score, risk.score, old_rev, risk.revenue_at_risk,
    )


@router.patch("/{action_id}", response_model=ActionCard)
def move(
    action_id: int,
    payload: MoveActionRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> ActionCard:
    repo = ActionRepository(session)
    action = repo.get(action_id)
    if not action or action.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")

    was_completed = action.status == ActionStatus.COMPLETED
    updated = repo.update_status(action, payload.status)

    # Feedback loop: apply the risk reduction exactly once, on the transition
    # into Completed.
    if payload.status == ActionStatus.COMPLETED and not was_completed:
        _apply_mitigation_effect(session, updated)

    return _card(updated)


@router.delete("/{action_id}")
def delete_action(
    action_id: int,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Remove a **completed** mitigation from the board (its risk reduction has
    already been applied). In-flight actions can't be deleted."""
    repo = ActionRepository(session)
    action = repo.get(action_id)
    if not action or action.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")
    if action.status != ActionStatus.COMPLETED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Only completed actions can be removed from the board.",
        )
    repo.delete(action)
    return {"deleted": action_id}
