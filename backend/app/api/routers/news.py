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
    filtered: int
    matched: int
    new_risks: list[int]
    provider: str
    message: str


@router.get("", response_model=list[NewsCard])
def recent_news(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> list[NewsCard]:
    items = NewsRepository(session).latest(20)
    return [
        NewsCard(id=n.id, source=n.source, title=n.title,
                 time=relative_time(n.published_at), url=n.url or "")
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
    from app.services.ai.adapter import ai_client

    news_repo = NewsRepository(session)
    pipeline = IntelligencePipeline(session)

    collected = NewsEngine().collect()
    new_risks: list[int] = []
    matched = 0
    filtered = 0
    for item in collected:
        item = news_repo.add(item)
        result = pipeline.process(company_id, item)
        if result.filtered:
            filtered += 1
        if result.matched and result.risk:
            matched += 1
            new_risks.append(result.risk.id)

    kept = len(collected) - filtered
    msg = (
        f"Scraped {len(collected)} headline(s); the AI gatekeeper filtered out "
        f"{filtered} as fake/irrelevant. Of {kept} credible items, {matched} "
        f"matched your Digital Twin and generated new risks."
    )
    return IngestResult(
        ingested=len(collected), filtered=filtered, matched=matched,
        new_risks=new_risks, provider=ai_client.provider, message=msg,
    )
