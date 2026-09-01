"""Country resolution that understands how news actually refers to places.

Headlines say "Canadian lumber", "Ottawa", "Chinese exports" or "Shanghai port"
far more often than the bare country name. Matching only the exact word "Canada"
therefore drops most relevant stories. This module maps each country to its
demonym and major cities/capital so "Canadian" and "Ottawa" both resolve to
Canada. Shared by event country-detection and the relevance geo signal.
"""
from __future__ import annotations

import re

# Canonical country -> extra surface forms (demonym, capital / major cities,
# common variants). Ordered roughly by supply-chain relevance; resolve_country
# returns the first match. Deliberately omits ultra-short ambiguous tokens like
# bare "us"/"uk" (they collide with the pronoun / common words).
_ALIASES: dict[str, tuple[str, ...]] = {
    "Taiwan": ("taiwanese", "taipei", "kaohsiung", "hsinchu"),
    "China": ("chinese", "beijing", "shanghai", "shenzhen", "guangdong", "prc"),
    "Japan": ("japanese", "tokyo", "osaka", "nagoya", "yokohama"),
    "USA": ("american", "u.s.", "u.s.a.", "usa", "united states", "washington"),
    "Vietnam": ("vietnamese", "hanoi", "ho chi minh"),
    "Malaysia": ("malaysian", "kuala lumpur", "penang"),
    "Korea": ("korean", "south korea", "south korean", "seoul"),
    "India": ("indian", "mumbai", "delhi", "chennai", "bengaluru"),
    "Germany": ("german", "berlin", "munich", "hamburg"),
    "Netherlands": ("dutch", "amsterdam", "rotterdam"),
    "France": ("french", "paris"),
    "Italy": ("italian", "rome", "milan"),
    "Spain": ("spanish", "madrid", "barcelona"),
    "Poland": ("polish", "warsaw"),
    "Mexico": ("mexican", "mexico city"),
    "Brazil": ("brazilian", "sao paulo", "brasilia"),
    "Canada": ("canadian", "ottawa", "toronto", "vancouver", "montreal"),
    "UK": ("british", "britain", "u.k.", "united kingdom", "london", "england"),
    "Philippines": ("filipino", "philippine", "manila"),
    "Indonesia": ("indonesian", "jakarta"),
    "Thailand": ("thai", "bangkok"),
    "Turkey": ("turkish", "ankara", "istanbul"),
    "Singapore": ("singaporean",),
    "Australia": ("australian", "sydney", "melbourne"),
    "Bangladesh": ("bangladeshi", "dhaka"),
    "Ukraine": ("ukrainian", "kyiv", "kiev"),
    "Russia": ("russian", "moscow"),
    "Egypt": ("egyptian", "cairo", "suez"),
    "Saudi Arabia": ("saudi", "riyadh"),
    "UAE": ("emirati", "dubai", "abu dhabi", "united arab emirates"),
}

# Normalise a few non-canonical spellings to our canonical key.
_CANON = {
    "united states": "USA",
    "united kingdom": "UK",
    "south korea": "Korea",
    "united arab emirates": "UAE",
}


def canonical(country: str) -> str:
    return _CANON.get((country or "").strip().lower(), country)


def surface_forms(country: str) -> list[str]:
    """All lowercase surface forms (name + demonym + cities) for a country."""
    canon = canonical(country)
    return [canon.lower(), *_ALIASES.get(canon, ())]


def _has(token: str, text_lower: str) -> bool:
    return re.search(r"\b" + re.escape(token) + r"\b", text_lower) is not None


def mentions(country: str, text_lower: str) -> bool:
    """True if the text names the country by name, demonym, or a major city."""
    return any(_has(t, text_lower) for t in surface_forms(country))


def resolve_country(text_lower: str) -> str:
    """The first country named in the text (by name / demonym / city), canonical."""
    for country in _ALIASES:
        if mentions(country, text_lower):
            return country
    return ""
