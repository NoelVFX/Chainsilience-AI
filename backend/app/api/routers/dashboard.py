"""Dashboard endpoint — aggregated KPIs, top risks, news and action summary."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.db.session import get_session
from app.schemas.domain import DashboardResponse
from app.services.dashboard import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    background_tasks: BackgroundTasks,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> DashboardResponse:
    payload = DashboardService(session).build(company_id)
    # Self-heal: if there are no risks yet, backfill from the recent stored-news
    # window in the background (debounced, de-duped) so the dashboard populates
    # without the user having to trigger a rebuild. Newly-matched risks show on
    # the next refetch.
    if not payload.get("risks"):
        from app.api.routers.company import _seed_risks_from_recent_news

        background_tasks.add_task(_seed_risks_from_recent_news, company_id)
    return DashboardResponse(**payload)
