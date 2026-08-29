"""Real-time news poller.

An asyncio background loop that, every ``news_poll_seconds``:
  1. scrapes all configured RSS feeds **concurrently** (async),
  2. inserts new, de-duped ``NewsItem``s (keeping their real published time),
  3. (optionally) runs the risk pipeline for the newly-relevant items of each
     company that has a Digital Twin — gated by the cheap relevance heuristic so
     only items that plausibly touch a company path incur LLM work.

The blocking DB + LLM work is offloaded to worker threads so the API event loop
is never stalled, and every step is guarded so one failure can't kill the loop.
"""
from __future__ import annotations

import asyncio

from sqlmodel import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import engine
from app.models.entities import NewsItem
from app.repositories import CompanyRepository, NewsRepository, TwinRepository
from app.services.agents.relevance import RelevanceAgent, build_profile
from app.services.digital_twin import DigitalTwinService
from app.services.news_engine import NewsEngine
from app.services.pipeline import IntelligencePipeline

logger = get_logger(__name__)

_task: "asyncio.Task | None" = None


def _persist_new(scraped: list[NewsItem]) -> list[int]:
    """Insert items not already stored (de-dupe by URL, then title). Return ids."""
    new_ids: list[int] = []
    with Session(engine) as s:
        repo = NewsRepository(s)
        for item in scraped:
            if item.url and repo.get_by_url(item.url):
                continue
            if not item.url and repo.exists_title(item.title):
                continue
            saved = repo.add(item)
            new_ids.append(saved.id)
    return new_ids


def _list_companies() -> list[tuple[int, str]]:
    with Session(engine) as s:
        return [(c.id, c.countries or "") for c in CompanyRepository(s).all()]


def _process_company(company_id: int, countries: str, item_ids: list[int]) -> int:
    """Heuristic-gate the new items for one company, then run the pipeline."""
    made = 0
    with Session(engine) as s:
        graph = DigitalTwinService(TwinRepository(s)).build_graph(company_id)
        if not graph.nodes:
            return 0  # no twin yet — nothing to match against
        profile = build_profile(graph, countries)
        relevance = RelevanceAgent()
        company = CompanyRepository(s).get(company_id)
        pipeline = IntelligencePipeline(s, company=company)
        for iid in item_ids:
            if made >= settings.news_poll_max_new_risks:
                break
            news = s.get(NewsItem, iid)
            if news is None:
                continue
            # cheap pre-filter: skip LLM work on clearly-irrelevant items
            if not relevance._heuristic(news, profile).relevant:
                continue
            res = pipeline.process(company_id, news)
            if res.matched and res.risk:
                made += 1
    return made


async def _cycle() -> None:
    scraped = await NewsEngine().collect_async(limit=60)

    new_ids = await asyncio.to_thread(_persist_new, scraped)
    if new_ids:
        logger.info("News poller: %d fresh item(s).", len(new_ids))
    if not new_ids or not settings.news_poll_generate_risks:
        return

    companies = await asyncio.to_thread(_list_companies)
    for cid, countries in companies:
        try:
            made = await asyncio.to_thread(_process_company, cid, countries, new_ids)
            if made:
                logger.info("News poller: %d new risk(s) for company %s.", made, cid)
        except Exception as exc:  # noqa: BLE001
            logger.info("News poller: company %s failed (%s).", cid, exc)


async def _loop() -> None:
    logger.info("News poller running every %ds.", settings.news_poll_seconds)
    while True:
        try:
            await _cycle()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("News poller cycle failed: %s", exc)
        await asyncio.sleep(settings.news_poll_seconds)


def start() -> None:
    global _task
    if not settings.news_poll_enabled:
        logger.info("News poller disabled (NEWS_POLL_ENABLED=0).")
        return
    if _task and not _task.done():
        return
    _task = asyncio.create_task(_loop())


async def stop() -> None:
    global _task
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
