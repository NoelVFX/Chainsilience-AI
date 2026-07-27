"""Relevance Extractor Agent — filters news by relevance to THIS company.

Unlike a generic "is this supply-chain news" check, this agent reasons over the
company's own **Digital Twin paths** — its named suppliers, the components /
commodities it depends on, its products, production locations, operating
countries, and logistics routes/ports — and keeps only news that plausibly
touches one of them.

Uses the LLM (Nemotron) when configured; otherwise a transparent entity/keyword
match against the twin profile so it always runs offline.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.logging import get_logger
from app.models.entities import NewsItem
from app.services.ai.adapter import ai_client
from app.services.digital_twin import TwinGraph

logger = get_logger(__name__)


def build_profile(graph: TwinGraph, company_countries: str = "") -> dict:
    """Compact supply-chain profile of the company, derived from its twin."""
    by_type: dict[str, list[str]] = {}
    countries: set[str] = set()
    for n in graph.nodes.values():
        by_type.setdefault(n.type.value, []).append(n.name)
        if n.country and n.country.lower() != "global":
            countries.add(n.country)
    for c in (company_countries or "").replace(";", ",").split(","):
        if c.strip():
            countries.add(c.strip())
    return {
        "suppliers": by_type.get("supplier", []),
        "components": by_type.get("component", []),
        "products": by_type.get("product", []),
        "factories": by_type.get("factory", []),
        "ports_routes": by_type.get("port", []) + by_type.get("route", []),
        "countries": sorted(countries),
    }


@dataclass
class RelevanceVerdict:
    relevant: bool
    confidence: float
    reason: str
    matched: list[str] = field(default_factory=list)
    source: str = "heuristic"  # "agent" (LLM) or "heuristic"


class RelevanceAgent:
    def assess(self, news: NewsItem, profile: dict) -> RelevanceVerdict:
        llm = ai_client.assess_relevance(news.title, news.body, profile)
        if llm is not None:
            relevant = bool(llm.get("relevant", False))
            conf = float(llm.get("confidence", 0.7) or 0.7)
            reason = str(llm.get("reason", "")) or "Assessed by relevance agent."
            matched = [str(m) for m in (llm.get("matched") or [])]
            return RelevanceVerdict(relevant, conf, reason, matched, "agent")
        return self._heuristic(news, profile)

    @staticmethod
    def _heuristic(news: NewsItem, profile: dict) -> RelevanceVerdict:
        text = f"{news.title} {news.body}".lower()

        def hits(values: list[str]) -> list[str]:
            found = []
            for v in values:
                v = (v or "").strip()
                if not v:
                    continue
                # Whole-word/phrase match to avoid spurious substring hits.
                if re.search(r"\b" + re.escape(v.lower()) + r"\b", text):
                    found.append(v)
            return found

        matched: list[str] = []
        for key in ("suppliers", "components", "products", "factories", "ports_routes", "countries"):
            matched += hits(profile.get(key, []))
        # Component/commodity keywords broaden matching beyond exact names.
        commodity_terms = ("wafer", "silicon", "rare earth", "neodymium", "lithium",
                           "cobalt", "steel", "semiconductor", "chip", "magnet")
        commodity = [t for t in commodity_terms if t in text
                     and any(t in (c or "").lower() for c in profile.get("components", []))]
        matched += commodity

        matched = sorted(set(matched))
        relevant = len(matched) > 0
        confidence = min(0.9, 0.55 + 0.1 * len(matched)) if relevant else 0.5
        reason = (
            f"Touches company paths: {', '.join(matched[:4])}." if relevant
            else "No overlap with the company's suppliers, inputs, products, sites, or routes."
        )
        return RelevanceVerdict(relevant, confidence, reason, matched, "heuristic")
