"""News Intelligence Engine.

Modular news sources behind a common ``NewsSource`` protocol. The primary source
scrapes **live public RSS feeds** for supply-chain / trade / logistics / disaster
signals. Feeds are fetched **concurrently** (async) so a full sweep is fast enough
to run on a short poll interval, and each item keeps its **real published time**
from the feed. If the network is unavailable it falls back to an offline sample
so the demo always works.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Protocol

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.models.entities import NewsItem, _utcnow

logger = get_logger(__name__)


class NewsSource(Protocol):
    name: str

    def fetch(self) -> list[dict]:
        """Return raw news dicts: {source, title, body, url, published_at}."""
        ...


class RSSNewsSource:
    """Live RSS scraper across the configured supply-chain feeds."""

    name = "RSS"

    def __init__(self, feeds: list[str] | None = None) -> None:
        self.feeds = feeds or settings.news_rss_feeds

    # --- parsing (shared by sync + async paths) -----------------------------
    @staticmethod
    def _parse_feed(content: bytes, url: str) -> list[dict]:
        import feedparser  # local import keeps startup light

        parsed = feedparser.parse(content)
        source = (parsed.feed.get("title") if parsed.feed else None) or _host(url)
        items: list[dict] = []
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
                    "published_at": _parse_published(entry),
                }
            )
        return items

    # --- synchronous (used by manual triggers) ------------------------------
    def fetch(self) -> list[dict]:
        items: list[dict] = []
        headers = {"User-Agent": "ChainsilienceAI/1.0 (+https://chainsilience.ai)"}
        for url in self.feeds:
            try:
                resp = httpx.get(
                    url, timeout=settings.news_http_timeout, headers=headers,
                    follow_redirects=True,
                )
                resp.raise_for_status()
                items.extend(self._parse_feed(resp.content, url))
            except Exception as exc:  # noqa: BLE001
                logger.info("RSS fetch failed for %s (%s).", url, exc)
        return items

    # --- asynchronous (all feeds concurrently) ------------------------------
    async def fetch_async(self) -> list[dict]:
        headers = {"User-Agent": "ChainsilienceAI/1.0 (+https://chainsilience.ai)"}
        items: list[dict] = []

        async with httpx.AsyncClient(
            timeout=settings.news_http_timeout, headers=headers, follow_redirects=True
        ) as client:
            async def one(url: str) -> list[dict]:
                try:
                    resp = await client.get(url)
                    resp.raise_for_status()
                    return self._parse_feed(resp.content, url)
                except Exception as exc:  # noqa: BLE001
                    logger.info("RSS fetch failed for %s (%s).", url, exc)
                    return []

            results = await asyncio.gather(*(one(u) for u in self.feeds))
        for r in results:
            items.extend(r)
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
        now = _utcnow()
        return [{"source": s, "title": t, "body": "", "url": "", "published_at": now}
                for s, t in picks]


class NewsEngine:
    """Aggregates configured sources into persistable ``NewsItem`` objects."""

    def __init__(self, sources: list[NewsSource] | None = None) -> None:
        self.sources: list[NewsSource] = sources or [RSSNewsSource()]
        self._fallback = SampleFeedSource()

    # --- synchronous collect ------------------------------------------------
    def collect(self, limit: int = 12) -> list[NewsItem]:
        raw: list[dict] = []
        for source in self.sources:
            try:
                raw.extend(source.fetch())
            except Exception as exc:  # noqa: BLE001
                logger.info("Source %s failed (%s).", getattr(source, "name", "?"), exc)
        return self._to_items(raw, limit)

    # --- asynchronous collect (feeds fetched concurrently) ------------------
    async def collect_async(self, limit: int = 40) -> list[NewsItem]:
        raw: list[dict] = []
        for source in self.sources:
            try:
                if isinstance(source, RSSNewsSource):
                    raw.extend(await source.fetch_async())
                else:
                    raw.extend(source.fetch())
            except Exception as exc:  # noqa: BLE001
                logger.info("Source %s failed (%s).", getattr(source, "name", "?"), exc)
        return self._to_items(raw, limit)

    # --- shared de-dupe + build --------------------------------------------
    def _to_items(self, raw: list[dict], limit: int) -> list[NewsItem]:
        if not raw:
            logger.info("No live news collected — using offline sample.")
            raw = self._fallback.fetch()

        # De-dupe within the batch by URL first, then title. Newest first.
        raw.sort(key=lambda r: r.get("published_at") or _utcnow(), reverse=True)
        seen: set[str] = set()
        items: list[NewsItem] = []
        for r in raw:
            key = (r.get("url") or "").strip().lower() or ("t:" + r["title"].lower()[:120])
            if key in seen:
                continue
            seen.add(key)
            items.append(
                NewsItem(
                    source=r.get("source", "News"),
                    title=r["title"],
                    body=r.get("body", ""),
                    url=r.get("url", ""),
                    published_at=r.get("published_at") or _utcnow(),
                )
            )
            if len(items) >= limit:
                break
        return items


def _parse_published(entry) -> datetime:
    """Real publish time from the feed entry (UTC), falling back to now."""
    import calendar

    for key in ("published_parsed", "updated_parsed"):
        st = entry.get(key)
        if st:
            try:
                return datetime.fromtimestamp(calendar.timegm(st), tz=timezone.utc)
            except (ValueError, OverflowError, TypeError):
                continue
    return _utcnow()


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
