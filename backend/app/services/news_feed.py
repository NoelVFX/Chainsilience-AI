"""Company-scoped news feed.

Returns the news that actually matters to a company, in priority order:

  1. news that generated the company's risks (definitively relevant, and never
     buried by the volume of unrelated global scraping),
  2. other supply-chain-relevant recent items (cheap relevance heuristic),
  3. an empty result when no company-relevant news is available.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

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
        return []  # no company profile exists to establish relevance

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
            if n and _is_real(n) and _as_utc(n.published_at) >= cutoff:
                picked.append(n)
                seen.add(n.id)

    # 2. Other recent items that touch the company's supply chain.
    for n in news_repo.latest(200):
        if _as_utc(n.published_at) < cutoff:
            break
        if n.id in seen or not _is_real(n):
            continue
        if relevance._heuristic(n, profile).relevant:
            picked.append(n)
            seen.add(n.id)

    # Most-recent first, capped.
    picked.sort(key=lambda n: _as_utc(n.published_at), reverse=True)
    picked = picked[:limit]

    # An empty result is meaningful once a Digital Twin exists: it means the
    # stored recent news did not match this company's supply-chain profile.
    # Do not substitute unrelated or stale headlines for an empty relevant feed.
    return picked


def _is_real(n: NewsItem) -> bool:
    """Only surface news that links to a real external article.

    Synthetic starter items (the deterministic "Chainsilience Feed" seeded during
    onboarding to bootstrap the first risks) carry no URL, so they're excluded
    from the feed — the user can't click through to a source that doesn't exist.
    """
    return bool((n.url or "").strip())


def _as_utc(value: datetime) -> datetime:
    """Normalize database timestamps before comparing or sorting them."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
