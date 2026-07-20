"""Action Center endpoints: Kanban board and status transitions."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.core.constants import severity_color, severity_label
from app.db.session import get_session
from app.models.entities import Action, ActionStatus
from app.repositories import ActionRepository
from app.schemas.domain import (
    ActionBoardResponse,
    ActionCard,
    ActionColumn,
    MoveActionRequest,
)

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
    return _card(repo.update_status(action, payload.status))
