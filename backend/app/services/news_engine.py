"""News Intelligence Engine (spec module 6).

Modular news sources behind a common ``NewsSource`` protocol so real feeds
(RSS, GDELT, provider APIs) can be added without touching the pipeline. Ships
with a deterministic ``SampleFeedSource`` so the demo has a live "ingest news"
button that flows an item through the whole pipeline.
"""
from __future__ import annotations

import random
from typing import Protocol

from app.models.entities import NewsItem
from app.models.entities import _utcnow


class NewsSource(Protocol):
    name: str

    def fetch(self) -> list[dict]:
        """Return raw news dicts: {source, title, body, url}."""
        ...


class SampleFeedSource:
    """Offline source that emits a random plausible disruption headline."""

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
        source, title = random.choice(self._HEADLINES)
        return [{"source": source, "title": title, "body": "", "url": ""}]


class NewsEngine:
    """Aggregates configured sources into persistable ``NewsItem`` objects."""

    def __init__(self, sources: list[NewsSource] | None = None) -> None:
        self.sources: list[NewsSource] = sources or [SampleFeedSource()]

    def collect(self) -> list[NewsItem]:
        items: list[NewsItem] = []
        for source in self.sources:
            for raw in source.fetch():
                items.append(
                    NewsItem(
                        source=raw.get("source", source.name),
                        title=raw["title"],
                        body=raw.get("body", ""),
                        url=raw.get("url", ""),
                        published_at=_utcnow(),
                    )
                )
        return items
