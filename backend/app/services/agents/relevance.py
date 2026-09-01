"""Relevance Extractor Agent — filters news by relevance to THIS company.

Unlike a generic "is this supply-chain news" check, this agent reasons over the
company's own **Digital Twin paths** — its named suppliers, the components /
commodities it depends on, its products, production sites, and logistics routes /
ports — and keeps only news that plausibly touches one of them.

Key rule: **geography alone is not enough.** A story that merely happens in a
country the company operates in is NOT relevant. It becomes relevant only when a
named asset/commodity is mentioned, OR when a country that holds one of the
company's physical assets coincides with an actual disruption (war, export
control, strike, disaster, port closure, …). This keeps out generic
country-level noise while catching, e.g., "war in Iran" when the company keeps a
wafer warehouse in Iran.

Uses the LLM (Nemotron) when configured; otherwise a transparent, tiered
entity/geo match against the twin profile so it always runs offline.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.logging import get_logger
from app.models.entities import NewsItem
from app.services.ai.adapter import ai_client
from app.services.digital_twin import TwinGraph

logger = get_logger(__name__)

# Node types that represent a physical asset in a location — a disruption in one
# of these countries can actually hit the company.
_ASSET_TYPES = {"supplier", "factory", "warehouse", "port", "component", "product"}

# Words that mark a real supply-chain disruption (vs. generic country news).
# Deliberately excludes ambiguous human-interest terms like "conflict", "attack"
# and "fire" that routinely appear in non-supply-chain stories (e.g. wildlife
# conflict, animal attacks); armed events are still caught by war/invasion/
# missile/airstrike, cyber by cyberattack, and fires by wildfire/explosion/blast.
_DISRUPTION = (
    "war", "invasion", "missile", "airstrike", "strike",
    "protest", "unrest", "coup", "curfew", "riot", "blockade", "sanction",
    "embargo", "tariff", "export control", "export ban", "import ban",
    "restriction", "quota", "earthquake", "aftershock", "flood", "typhoon",
    "hurricane", "cyclone", "storm", "wildfire", "explosion", "blast",
    "drought", "shortage", "outage", "blackout", "closure", "shutdown",
    "shut down", "halt", "suspend", "congestion", "backlog", "delay", "disruption",
    "recall", "contamination", "spill", "quarantine", "lockdown", "cyberattack",
    "hack", "ransomware", "default", "bankruptcy", "grounded", "diversion",
)

# Human-interest framing that marks a story as NOT a supply-chain disruption,
# even when it mentions a disruption word in a supplier country — humanitarian /
# casualty disasters ("hundreds of foreigners missing in Tibet after floods") and
# crime / justice / personal stories ("Hongkonger sent back to jail as storm
# delays deportation"). Dropped from the geo+disruption path; a named company
# asset/commodity still overrides.
_OFF_TOPIC = (
    # casualty / disaster human-interest
    "foreigner", "tourist", "missing", "rescue", "survivor", "bodies",
    "mourn", "evacuat", "relief", "death toll", "casualt", "villagers",
    # crime / justice / personal
    "jail", "prison", "arrest", "deport", "police", "murder", "smuggl",
    "kidnap", "hostage", "convicted", "sentenced", "freed",
)

# Commodity terms that broaden matching beyond exact component names.
_COMMODITY_TERMS = (
    "wafer", "silicon", "rare earth", "neodymium", "lithium", "cobalt", "nickel",
    "copper", "steel", "aluminum", "aluminium", "semiconductor", "chip", "magnet",
    "battery", "polysilicon", "graphite", "palladium", "gallium", "germanium",
)


def build_profile(graph: TwinGraph, company_countries: str = "") -> dict:
    """Compact supply-chain profile of the company, derived from its twin.

    ``asset_countries`` holds only countries where the company has a *physical*
    asset (supplier / factory / warehouse / port / component / product) — the
    geography that a disruption can actually reach.
    """
    from app.core.geography import canonical

    by_type: dict[str, list[str]] = {}
    op_countries: set[str] = set()
    asset_countries: set[str] = set()
    for n in graph.nodes.values():
        by_type.setdefault(n.type.value, []).append(n.name)
        country = (n.country or "").strip()
        if country and country.lower() != "global":
            op_countries.add(country)
            if n.type.value in _ASSET_TYPES:
                # Store the canonical country so "US"/"USA"/"United States" (and
                # the twin vs. the declared profile) all reconcile to one form.
                asset_countries.add(canonical(country))
    company_list = [
        c.strip() for c in (company_countries or "").replace(";", ",").split(",") if c.strip()
    ]
    company_set = {canonical(c) for c in company_list}
    for c in company_list:
        op_countries.add(c)
    # Constrain the disruption-geography signal to the company's CURRENTLY
    # declared operating countries (canonicalised), so a stale twin can't match
    # news for countries the company no longer operates in. With no declared
    # countries, fall back to the twin's asset countries.
    if company_set:
        asset_countries = {c for c in asset_countries if canonical(c) in company_set}
    return {
        "suppliers": by_type.get("supplier", []),
        "components": by_type.get("component", []),
        "products": by_type.get("product", []),
        "factories": by_type.get("factory", []) + by_type.get("warehouse", []),
        "ports_routes": by_type.get("port", []) + by_type.get("route", []),
        "countries": sorted(op_countries),
        "asset_countries": sorted(asset_countries),
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
                if re.search(r"\b" + re.escape(v.lower()) + r"\b", text):
                    found.append(v)
            return found

        # --- strong signals: a named asset or a commodity the company uses ---
        strong: list[str] = []
        for key in ("suppliers", "components", "products", "factories", "ports_routes"):
            strong += hits(profile.get(key, []))
        strong += [
            t for t in _COMMODITY_TERMS
            if t in text and any(t in (c or "").lower() for c in profile.get("components", []))
        ]

        # --- geo signal: a country that holds a physical asset ---------------
        # Match by name, demonym ("Canadian"), major city ("Ottawa"), or the
        # case-sensitive "US" acronym — using the ORIGINAL (mixed-case) text so
        # "US tariffs" registers while the pronoun "us" does not.
        from app.core.geography import mentions

        raw = f"{news.title} {news.body}"
        geo = [c for c in profile.get("asset_countries", []) if mentions(c, raw)]
        # Disruption must be signalled in the TITLE (the primary signal) as a
        # whole word. Scanning the body — or matching substrings — produced false
        # positives like a China story that merely mentions "conflict"/"attack"
        # in passing, or "war" inside "warehouse". Requiring a real disruption
        # word in the headline keeps "Earthquake hits Taiwan" / "Export ban on
        # China chips" while dropping generic country news.
        title = news.title.lower()
        disruption = [
            d for d in _DISRUPTION
            # allow a trailing "s" so plurals match too (tariffs, export controls,
            # sanctions, closures, …) without matching inside larger words.
            if re.search(r"\b" + re.escape(d) + r"s?\b", title)
        ]

        strong = sorted(set(strong))
        geo = sorted(set(geo))

        # A human-interest story (casualty/disaster or crime/justice) is not a
        # supply-chain disruption even if it names a disruption word in a
        # supplier country.
        off_topic = any(h in title for h in _OFF_TOPIC)

        # Relevant when a named asset/commodity is touched, OR when a disruption
        # coincides with a country where the company actually has an asset (and the
        # story isn't human-interest). Geography alone is dropped.
        geo_disruption = bool(geo) and bool(disruption) and not off_topic
        relevant = bool(strong) or geo_disruption

        matched = strong + ([f"{g} + {disruption[0]}" for g in geo] if geo_disruption else [])
        if relevant:
            conf = min(0.95, 0.6 + 0.12 * len(strong) + (0.15 if geo_disruption else 0))
            reason = "Touches company paths: " + ", ".join(matched[:4]) + "."
        else:
            conf = 0.5
            if geo and disruption and off_topic:
                reason = (
                    f"A human-interest story in {geo[0]}, not a supply-chain "
                    "disruption — dropped."
                )
            elif geo and not disruption:
                reason = (
                    f"Mentions {geo[0]} (an asset location) but no disruption to a "
                    "supply-chain path — dropped as generic country news."
                )
            else:
                reason = "No overlap with the company's suppliers, inputs, products, sites, or routes."
        return RelevanceVerdict(relevant, conf, reason, matched, "heuristic")
