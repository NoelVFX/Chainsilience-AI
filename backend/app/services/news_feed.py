"""Company-scoped news feed.

Returns the news that actually matters to a company, in priority order:

  1. news that generated the company's risks (definitively relevant, and never
     buried by the volume of unrelated global scraping),
  2. other supply-chain-relevant recent items (cheap relevance heuristic),
  3. and, only when the company has no twin yet, the latest news as a fallback.
"""
from __future__ import annotations

from datetime import timedelta

from app.core.config import settings
from app.models.entities import NewsItem, _utcnow
from app.repositories import (
    CompanyRepository,
    EventRepository,
    NewsRepository,
    RiskRepository,
    TwinRepository,
)
from app.services.agents.relevance import RelevanceAgent, build_profile
from app.services.digital_twin import DigitalTwinService


def relevant_news(session, company_id: int, limit: int = 6) -> list[NewsItem]:
    news_repo = NewsRepository(session)
    graph = DigitalTwinService(TwinRepository(session)).build_graph(company_id)
    if not graph.nodes:
        return news_repo.latest(limit)  # no twin yet — show the raw feed

    company = CompanyRepository(session).get(company_id)
    profile = build_profile(graph, getattr(company, "countries", "") or "")
    relevance = RelevanceAgent()

    picked: list[NewsItem] = []
    seen: set[int] = set()
    cutoff = _utcnow() - timedelta(days=settings.news_max_age_days)

    # 1. News behind this company's own risks — always relevant, and found by a
    #    direct lookup so it can't be pushed out by unrelated global scraping.
    events = EventRepository(session)
    for r in RiskRepository(session).for_company(company_id):
        if not r.event_id:
            continue
        ev = events.get(r.event_id)
        if ev and ev.news_id and ev.news_id not in seen:
            n = session.get(NewsItem, ev.news_id)
            if n and n.published_at >= cutoff:
                picked.append(n)
                seen.add(n.id)

    # 2. Other recent items that touch the company's supply chain.
    for n in news_repo.latest(200):
        if n.published_at < cutoff:
            break
        if n.id in seen:
            continue
        if relevance._heuristic(n, profile).relevant:
            picked.append(n)
            seen.add(n.id)

    # Most-recent first, capped.
    picked.sort(key=lambda n: n.published_at, reverse=True)
    picked = picked[:limit]

    # An empty result is meaningful once a Digital Twin exists: it means the
    # stored recent news did not match this company's supply-chain profile.
    # Keep the raw-feed fallback only for companies that have no twin yet, where
    # relevance cannot be assessed.
    return picked
