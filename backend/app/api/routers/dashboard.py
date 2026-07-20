"""Dashboard endpoint — aggregated KPIs, top risks, news and action summary."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.db.session import get_session
from app.schemas.domain import DashboardResponse
from app.services.dashboard import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> DashboardResponse:
    return DashboardResponse(**DashboardService(session).build(company_id))
