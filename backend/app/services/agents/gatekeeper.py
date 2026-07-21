"""News Gatekeeper Agent — the AI filter that keeps junk out of the pipeline.

Every scraped item is judged on two axes before it costs any downstream
reasoning:
  * **credible** — real reporting, not satire / rumour / spam / clickbait.
  * **relevant** — actually about physical supply chains, logistics, trade,
    commodities, manufacturing, or disruptions.

Uses the LLM (Nemotron) when configured; otherwise a transparent keyword +
heuristic fallback so filtering always runs offline.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.logging import get_logger
from app.models.entities import NewsItem
from app.services.ai.adapter import ai_client

logger = get_logger(__name__)

# Supply-chain relevance signal.
_RELEVANT_TERMS = (
    "supply", "chip", "semiconductor", "wafer", "factory", "manufactur", "port",
    "shipping", "freight", "cargo", "container", "logistics", "export", "import",
    "tariff", "sanction", "trade", "commodity", "rare earth", "lithium", "cobalt",
    "steel", "oil", "fuel", "strike", "earthquake", "typhoon", "flood", "fire",
    "shortage", "congestion", "canal", "warehouse", "supplier", "customs",
    "blockade", "war", "embargo", "recall", "outage", "mine", "smelter",
)
# Clickbait / low-credibility signal (fallback heuristic).
_CLICKBAIT_TERMS = (
    "you won't believe", "shocking", "this one trick", "gone wrong", "click here",
    "horoscope", "celebrity", "goes viral", "top 10 memes", "prank",
)
# Sources we treat as inherently credible in the fallback path.
_TRUSTED_HINTS = (
    "reuters", "bloomberg", "ft", "financial times", "wsj", "wall street", "bbc",
    "nikkei", "lloyd", "gcaptain", "freightwaves", "splash247", "supply chain",
    "scmp", "guardian", "cnbc", "ap", "associated press",
)


@dataclass
class Verdict:
    accepted: bool
    credible: bool
    relevant: bool
    confidence: float
    reason: str
    source: str  # "agent" (LLM) or "heuristic"


class GatekeeperAgent:
    def review(self, news: NewsItem) -> Verdict:
        text = f"{news.title}\n{news.body}"

        llm = ai_client.filter_news(news.title, news.body)
        if llm is not None:
            credible = bool(llm.get("credible", True))
            relevant = bool(llm.get("relevant", True)) and bool(
                llm.get("is_supply_chain", llm.get("relevant", True))
            )
            conf = float(llm.get("confidence", 0.7) or 0.7)
            reason = str(llm.get("reason", "")) or "Assessed by gatekeeper agent."
            return Verdict(credible and relevant, credible, relevant, conf, reason, "agent")

        return self._heuristic(news, text)

    @staticmethod
    def _heuristic(news: NewsItem, text: str) -> Verdict:
        lowered = text.lower()
        relevant = any(term in lowered for term in _RELEVANT_TERMS)
        clickbait = any(term in lowered for term in _CLICKBAIT_TERMS)
        trusted = any(hint in news.source.lower() for hint in _TRUSTED_HINTS)
        credible = not clickbait
        confidence = 0.8 if (trusted and relevant) else 0.6 if relevant else 0.4
        if not relevant:
            reason = "No supply-chain / logistics / trade signal detected."
        elif clickbait:
            reason = "Reads as clickbait / low-credibility."
        else:
            reason = "Supply-chain relevant from a recognised source."
        return Verdict(relevant and credible, credible, relevant, confidence, reason, "heuristic")
