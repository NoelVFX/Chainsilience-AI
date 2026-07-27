"""Verifier Agent — filters out unsupported or unreliable news.

Runs first in the agent layer. Judges each item on:
  * **reliable** — a credible outlet; not rumour, satire, clickbait, opinion, or
    an unconfirmed single-source claim.
  * **supported** — concrete, verifiable reporting of an actual event, not vague
    speculation or hypotheticals.

Uses the LLM (Nemotron) when configured; otherwise a transparent heuristic
(source reputation + speculation/clickbait language) so it always runs offline.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.logging import get_logger
from app.models.entities import NewsItem
from app.services.ai.adapter import ai_client

logger = get_logger(__name__)

# Language that signals rumour / speculation / unverified claims.
_SPECULATION = (
    "rumor", "rumour", "allegedly", "unconfirmed", "speculation", "speculate",
    "could ", "may ", "might ", "reportedly", "sources say", "some say",
    "conspiracy", "hoax", "opinion:", "we think", "predict", "what if",
)
_CLICKBAIT = (
    "you won't believe", "shocking", "this one trick", "gone wrong", "click here",
    "horoscope", "celebrity", "goes viral", "top 10 memes", "prank", "!!!",
)
_TRUSTED = (
    "reuters", "bloomberg", "ft", "financial times", "wsj", "wall street", "bbc",
    "nikkei", "lloyd", "gcaptain", "freightwaves", "splash247", "supply chain",
    "scmp", "guardian", "cnbc", "ap", "associated press", "nytimes", "the times",
)


@dataclass
class VerifyVerdict:
    passed: bool
    reliable: bool
    supported: bool
    confidence: float
    reason: str
    red_flags: list[str] = field(default_factory=list)
    source: str = "heuristic"  # "agent" (LLM) or "heuristic"


class VerifierAgent:
    def verify(self, news: NewsItem) -> VerifyVerdict:
        llm = ai_client.verify_news(news.title, news.body, news.source)
        if llm is not None:
            reliable = bool(llm.get("reliable", True))
            supported = bool(llm.get("supported", True))
            conf = float(llm.get("confidence", 0.7) or 0.7)
            reason = str(llm.get("reason", "")) or "Assessed by verifier agent."
            flags = [str(f) for f in (llm.get("red_flags") or [])]
            return VerifyVerdict(reliable and supported, reliable, supported, conf,
                                 reason, flags, "agent")
        return self._heuristic(news)

    @staticmethod
    def _heuristic(news: NewsItem) -> VerifyVerdict:
        text = f"{news.title}\n{news.body}".lower()
        flags: list[str] = []
        clickbait = any(t in text for t in _CLICKBAIT)
        speculative = sum(1 for t in _SPECULATION if t in text)
        trusted = any(h in news.source.lower() for h in _TRUSTED)
        # Concrete reporting tends to carry specifics (numbers, places, dates).
        has_specifics = bool(re.search(r"\d", text))

        if clickbait:
            flags.append("clickbait language")
        if speculative >= 2:
            flags.append("speculative / unconfirmed phrasing")
        if not trusted and not has_specifics:
            flags.append("unrecognised source without concrete details")

        reliable = not clickbait and not (speculative >= 2 and not trusted)
        supported = has_specifics or trusted
        confidence = 0.8 if trusted else 0.6 if supported else 0.45
        passed = reliable and supported
        reason = (
            "Credible, concrete reporting." if passed
            else "Filtered: " + (", ".join(flags) or "insufficiently supported.")
        )
        return VerifyVerdict(passed, reliable, supported, confidence, reason, flags, "heuristic")
