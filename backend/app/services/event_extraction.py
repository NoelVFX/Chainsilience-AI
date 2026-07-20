"""AI Event Extraction (spec module 2 + 7).

Converts a free-text news item into a structured disruption ``Event``. Uses the
LLM when available and otherwise a transparent keyword classifier so extraction
always works offline.
"""
from __future__ import annotations

from app.models.entities import Event, NewsItem, Severity
from app.services.ai.adapter import ai_client

# Keyword → (event type, base severity) for the deterministic fallback.
_KEYWORDS: list[tuple[tuple[str, ...], str, Severity]] = [
    (("earthquake", "quake", "magnitude"), "earthquake", Severity.CRITICAL),
    (("fire", "explosion", "blaze"), "factory_fire", Severity.CRITICAL),
    (("war", "missile", "conflict", "attack on"), "conflict", Severity.CRITICAL),
    (("cyberattack", "ransomware", "hack"), "cyberattack", Severity.HIGH),
    (("strike", "walkout", "labour", "labor dispute"), "strike", Severity.HIGH),
    (("congestion", "delay", "backlog", "canal", "port"), "port_congestion", Severity.HIGH),
    (("export control", "export restriction", "sanction", "tariff", "ban"),
     "export_restriction", Severity.MEDIUM),
    (("shortage", "price", "spike", "surge"), "commodity_price", Severity.MEDIUM),
    (("typhoon", "hurricane", "flood", "storm", "weather"), "weather", Severity.MEDIUM),
    (("fuel", "bunker", "oil price"), "fuel_price", Severity.LOW),
]

_COUNTRIES = [
    "Taiwan", "China", "Japan", "USA", "United States", "Vietnam", "Malaysia",
    "Netherlands", "Germany", "Egypt", "Philippines", "Korea", "India",
]


def _classify(text: str) -> tuple[str, Severity]:
    lowered = text.lower()
    for needles, etype, sev in _KEYWORDS:
        if any(n in lowered for n in needles):
            return etype, sev
    return "disruption", Severity.MEDIUM


def _detect_country(text: str) -> str:
    for c in _COUNTRIES:
        if c.lower() in text.lower():
            return "USA" if c == "United States" else c
    return ""


class EventExtractionService:
    """Extract a structured event from a news item."""

    def extract(self, news: NewsItem) -> Event:
        text = f"{news.title}\n{news.body}"
        etype, severity = _classify(text)
        country = _detect_country(text)
        confidence = 0.7

        # Upgrade with the LLM when configured; merge over the rule-based base.
        llm = ai_client.extract_event(news.title, news.body)
        if llm:
            etype = llm.get("type", etype)
            country = llm.get("country") or country
            try:
                severity = Severity(str(llm.get("severity", severity.value)).lower())
            except ValueError:
                pass
            confidence = float(llm.get("confidence", confidence))

        return Event(
            news_id=news.id,
            type=etype,
            country=country,
            location=country,
            severity=severity,
            confidence=confidence,
            summary=ai_client.summarize(news.title, news.body),
        )
