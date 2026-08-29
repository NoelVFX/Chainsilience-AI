"""News endpoints: recent feed + live ingestion through the AI pipeline."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.core.timeutil import relative_time
from app.db.session import get_session
from app.repositories import CompanyRepository, NewsRepository
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
    """Recent news that touches THIS company's supply chain.

    Prioritises the news behind the company's own risks and other relevant items;
    falls back to the raw latest feed if the company has no twin or nothing
    relevant is found, so the feed is never blank.
    """
    from app.services.news_feed import relevant_news

    return [
        NewsCard(id=n.id, source=n.source, title=n.title,
                 time=relative_time(n.published_at), url=n.url or "")
        for n in relevant_news(session, company_id, limit=20)
    ]


@router.post("/ingest", response_model=IngestResult)
def ingest(
    background_tasks: BackgroundTasks,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> IngestResult:
    """Pull the latest news and run each item through the full pipeline.

    Demonstrates the live end-to-end flow: news → event → match → risk →
    recommended actions. New matched risks appear on the dashboard immediately.
    """
    from app.services.ai.adapter import ai_client

    news_repo = NewsRepository(session)
    company = CompanyRepository(session).get(company_id)
    pipeline = IntelligencePipeline(session, company=company)

    collected = NewsEngine().collect()
    new_risks: list[int] = []
    matched = 0
    new_count = 0
    unreliable = 0  # dropped by the Verifier agent
    irrelevant = 0  # dropped by the Relevance agent (or unbound supplier path)
    for item in collected:
        # Skip items already stored (de-dupe on repeated ingest).
        if (item.url and news_repo.get_by_url(item.url)) or (
            not item.url and news_repo.exists_title(item.title)
        ):
            continue
        item = news_repo.add(item)
        new_count += 1
        result = pipeline.process(company_id, item)
        if result.filter_stage == "verifier":
            unreliable += 1
        elif result.filtered:
            irrelevant += 1
        if result.matched and result.risk:
            matched += 1
            new_risks.append(result.risk.id)

    # New matched risks change the company's corpus — re-index for RAG.
    if new_risks:
        from app.services.rag_company import get_company_rag

        background_tasks.add_task(get_company_rag().reindex, company_id)

    msg = (
        f"Scraped {len(collected)} headline(s); {new_count} were new. The Verifier "
        f"dropped {unreliable} as unreliable/unsupported; the Relevance agent dropped "
        f"{irrelevant} as not touching your supply-chain paths. {matched} "
        f"relevant risk(s) were generated."
    )
    return IngestResult(
        ingested=new_count, filtered=unreliable + irrelevant, matched=matched,
        new_risks=new_risks, provider=ai_client.provider, message=msg,
    )
