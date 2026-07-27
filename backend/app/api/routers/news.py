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
    from app.repositories import CompanyRepository

    news_repo = NewsRepository(session)
    company = CompanyRepository(session).get(company_id)
    pipeline = IntelligencePipeline(session, company=company)

    collected = NewsEngine().collect()
    new_risks: list[int] = []
    matched = 0
    unreliable = 0  # dropped by the Verifier agent
    irrelevant = 0  # dropped by the Relevance agent (or unbound supplier path)
    for item in collected:
        item = news_repo.add(item)
        result = pipeline.process(company_id, item)
        if result.filter_stage == "verifier":
            unreliable += 1
        elif result.filtered:
            irrelevant += 1
        if result.matched and result.risk:
            matched += 1
            new_risks.append(result.risk.id)

    msg = (
        f"Scraped {len(collected)} headline(s). The Verifier agent dropped "
        f"{unreliable} as unreliable/unsupported; the Relevance agent dropped "
        f"{irrelevant} as not touching your supply-chain paths. {matched} "
        f"relevant risk(s) were generated."
    )
    return IngestResult(
        ingested=len(collected), filtered=unreliable + irrelevant, matched=matched,
        new_risks=new_risks, provider=ai_client.provider, message=msg,
    )
