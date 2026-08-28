"""News Intelligence Engine (spec module 6).

Modular news sources behind a common ``NewsSource`` protocol. The primary source
scrapes **live public RSS feeds** (Reuters, FT, gCaptain, FreightWaves, Splash247,
Supply Chain Dive, BBC Business) for supply-chain / trade / logistics / disaster
signals. If the network is unavailable (or every feed fails), it transparently
falls back to an offline sample so the demo always works.
"""
from __future__ import annotations

from typing import Protocol

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.models.entities import NewsItem
from app.models.entities import _utcnow

logger = get_logger(__name__)


class NewsSource(Protocol):
    name: str

    def fetch(self) -> list[dict]:
        """Return raw news dicts: {source, title, body, url}."""
        ...


class RSSNewsSource:
    """Live RSS scraper across the configured supply-chain feeds."""

    name = "RSS"

    def __init__(self, feeds: list[str] | None = None) -> None:
        self.feeds = feeds or settings.news_rss_feeds

    def fetch(self) -> list[dict]:
        import feedparser  # local import keeps startup light

        items: list[dict] = []
        headers = {"User-Agent": "ChainsilienceAI/1.0 (+https://chainsilience.ai)"}
        for url in self.feeds:
            try:
                resp = httpx.get(
                    url, timeout=settings.news_http_timeout, headers=headers,
                    follow_redirects=True,
                )
                resp.raise_for_status()
                parsed = feedparser.parse(resp.content)
                source = (parsed.feed.get("title") if parsed.feed else None) or _host(url)
                for entry in parsed.entries[: settings.news_fetch_per_feed]:
                    title = (entry.get("title") or "").strip()
                    if not title:
                        continue
                    items.append(
                        {
                            "source": source,
                            "title": title,
                            "body": _clean(entry.get("summary", "")),
                            "url": entry.get("link", ""),
                        }
                    )
            except Exception as exc:  # noqa: BLE001
                logger.info("RSS fetch failed for %s (%s).", url, exc)
        return items


class SampleFeedSource:
    """Offline source that emits plausible disruption headlines (fallback)."""

    name = "SampleFeed"

    _HEADLINES = [
        ("Reuters", "Aftershocks in Taiwan slow restart of semiconductor fabs"),
        ("Bloomberg", "Panama Canal draft restrictions extend container backlogs"),
        ("Nikkei", "Fire at Vietnam electronics plant halts sensor assembly"),
        ("WSJ", "New US tariffs target imported rare-earth magnets"),
        ("Lloyd's List", "Red Sea diversions add ten days to Asia-Europe transit"),
        ("SCMP", "Shenzhen port congestion worsens amid export rush"),
        ("Mining.com", "Cobalt prices jump 15% on export licence delays"),
        ("gCaptain", "Hamburg dockworkers vote to strike over pay dispute"),
    ]

    def fetch(self) -> list[dict]:
        import random

        picks = random.sample(self._HEADLINES, k=3)
        return [{"source": s, "title": t, "body": "", "url": ""} for s, t in picks]


class NewsEngine:
    """Aggregates configured sources into persistable ``NewsItem`` objects."""

    def __init__(self, sources: list[NewsSource] | None = None) -> None:
        # RSS first; SampleFeed only kicks in if RSS returns nothing.
        self.sources: list[NewsSource] = sources or [RSSNewsSource()]
        self._fallback = SampleFeedSource()

    def collect(self, limit: int = 12) -> list[NewsItem]:
        raw: list[dict] = []
        for source in self.sources:
            try:
                raw.extend(source.fetch())
            except Exception as exc:  # noqa: BLE001
                logger.info("Source %s failed (%s).", getattr(source, "name", "?"), exc)

        if not raw:
            logger.info("No live news collected — using offline sample.")
            raw = self._fallback.fetch()

        # De-dupe by title, cap the batch.
        seen: set[str] = set()
        items: list[NewsItem] = []
        for r in raw:
            title = r["title"]
            key = title.lower()[:120]
            if key in seen:
                continue
            seen.add(key)
            items.append(
                NewsItem(
                    source=r.get("source", "News"),
                    title=title,
                    body=r.get("body", ""),
                    url=r.get("url", ""),
                    published_at=_utcnow(),
                )
            )
            if len(items) >= limit:
                break
        return items


def _host(url: str) -> str:
    try:
        from urllib.parse import urlparse

        return urlparse(url).netloc or "RSS"
    except Exception:  # noqa: BLE001
        return "RSS"


def _clean(html: str) -> str:
    """Strip tags/whitespace from an RSS summary; keep it short."""
    import re

    text = re.sub(r"<[^>]+>", " ", html or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:600]
