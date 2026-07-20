"""Feedback endpoint (spec module 17) — rate recommendations."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.db.session import get_session
from app.models.entities import Feedback
from app.repositories import FeedbackRepository
from app.schemas.domain import FeedbackRequest

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("")
def submit_feedback(
    payload: FeedbackRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    FeedbackRepository(session).add(
        Feedback(
            company_id=company_id, action_id=payload.action_id,
            rating=payload.rating, comment=payload.comment,
        )
    )
    return {"message": "Thanks — your feedback improves future recommendations."}
