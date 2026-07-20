"""News endpoints: recent feed + live ingestion through the AI pipeline."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.core.timeutil import relative_time
from app.db.session import get_session
from app.repositories import NewsRepository
from app.schemas.domain import NewsCard
from app.services.news_engine import NewsEngine
from app.services.pipeline import IntelligencePipeline

router = APIRouter(prefix="/news", tags=["news"])


class IngestResult(BaseModel):
    ingested: int
    matched: int
    new_risks: list[int]
    message: str


@router.get("", response_model=list[NewsCard])
def recent_news(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> list[NewsCard]:
    items = NewsRepository(session).latest(20)
    return [
        NewsCard(id=n.id, source=n.source, title=n.title, time=relative_time(n.published_at))
        for n in items
    ]


@router.post("/ingest", response_model=IngestResult)
def ingest(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> IngestResult:
    """Pull the latest news and run each item through the full pipeline.

    Demonstrates the live end-to-end flow: news → event → match → risk →
    recommended actions. New matched risks appear on the dashboard immediately.
    """
    news_repo = NewsRepository(session)
    pipeline = IntelligencePipeline(session)

    collected = NewsEngine().collect()
    new_risks: list[int] = []
    matched = 0
    for item in collected:
        item = news_repo.add(item)
        result = pipeline.process(company_id, item)
        if result.matched and result.risk:
            matched += 1
            new_risks.append(result.risk.id)

    msg = (
        f"Ingested {len(collected)} item(s); {matched} matched your Digital Twin "
        f"and generated new risks."
        if matched
        else f"Ingested {len(collected)} item(s); none matched your supply chain."
    )
    return IngestResult(
        ingested=len(collected), matched=matched, new_risks=new_risks, message=msg
    )
