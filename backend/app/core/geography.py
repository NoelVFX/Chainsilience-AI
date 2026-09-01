"""Country resolution that understands how news actually refers to places.

Headlines say "Canadian lumber", "Ottawa", "US tariffs" or "Chinese exports"
far more often than the formal country name. Matching only the exact word
"Canada" (or dropping "US" to avoid the pronoun) therefore loses most relevant
stories. This module maps each country to its demonym and major cities/capital,
and handles the ambiguous "US" acronym case-sensitively (the country is written
"US", the pronoun "us"). Shared by event country-detection and the relevance
geo signal.
"""
from __future__ import annotations

import re

# Canonical country -> lowercase surface forms (demonym, capital / major cities,
# safe variants). Matched case-insensitively. Ordered roughly by supply-chain
# relevance; resolve_country returns the first match.
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
    "UK": ("british", "britain", "u.k.", "uk", "united kingdom", "london", "england"),
    "Philippines": ("filipino", "philippine", "manila"),
    "Indonesia": ("indonesian", "jakarta"),
    "Thailand": ("thai", "bangkok"),
    "Turkey": ("turkish", "ankara", "istanbul"),
    "Singapore": ("singaporean",),
    "Australia": ("australian", "sydney", "melbourne"),
    "Bangladesh": ("bangladeshi", "dhaka"),
    "Ukraine": ("ukrainian", "kyiv", "kiev"),
    "Russia": ("russian", "moscow"),
    "Iran": ("iranian", "tehran"),
    "Israel": ("israeli", "tel aviv", "jerusalem"),
    "Iraq": ("iraqi", "baghdad"),
    "Yemen": ("yemeni", "houthi", "red sea"),
    "Egypt": ("egyptian", "cairo", "suez"),
    "Saudi Arabia": ("saudi", "riyadh"),
    "UAE": ("emirati", "dubai", "abu dhabi", "united arab emirates"),
}

# Normalise the common spellings a user might type (or a feed might use) to our
# canonical key, so "US" / "USA" / "United States" all resolve to one country.
_CANON = {
    "us": "USA",
    "u.s.": "USA",
    "u.s.a.": "USA",
    "united states": "USA",
    "america": "USA",
    "uk": "UK",
    "u.k.": "UK",
    "united kingdom": "UK",
    "britain": "UK",
    "great britain": "UK",
    "south korea": "Korea",
    "republic of korea": "Korea",
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


def mentions(country: str, text: str) -> bool:
    """True if the text names the country by name, demonym, or a major city.

    ``text`` is the ORIGINAL (mixed-case) string — the bare "US" country acronym
    is matched case-sensitively so "US tariffs" registers but "tells us" does not.
    """
    canon = canonical(country)
    if any(_has(t, text.lower()) for t in surface_forms(canon)):
        return True
    if canon == "USA" and re.search(r"(?<![A-Za-z])US(?![A-Za-z])", text):
        return True
    return False


def resolve_country(text: str) -> str:
    """The first country named in the text (by name / demonym / city), canonical."""
    for country in _ALIASES:
        if mentions(country, text):
            return country
    return ""
