"""LLM adapter — the single seam between the app and any language model.

Design goals:
  * The whole platform must run and demo with **no API key and no network**.
    Every method therefore has a deterministic, rule-based fallback.
  * When ``OPENAI_API_KEY`` is set, the same methods transparently upgrade to
    real LLM calls (news summarisation, entity extraction, risk narratives,
    email drafting, executive reports).

This keeps the six "AI modules" from the spec behind one clean interface
(Dependency Inversion): services depend on ``AIClient``, not on OpenAI.
"""
from __future__ import annotations

import json
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class AIClient:
    """Facade over an LLM with graceful offline fallbacks."""

    def __init__(self) -> None:
        self._client: Any | None = None
        self._enabled = bool(settings.openai_api_key)
        if self._enabled:
            try:  # pragma: no cover - depends on optional dependency + network
                from openai import OpenAI

                self._client = OpenAI(api_key=settings.openai_api_key)
                logger.info("AIClient: OpenAI enabled (model=%s).", settings.openai_model)
            except Exception as exc:  # noqa: BLE001
                logger.warning("AIClient: OpenAI init failed (%s); using fallback.", exc)
                self._enabled = False

    @property
    def live(self) -> bool:
        return self._enabled

    # -- low-level ------------------------------------------------------------
    def _chat(self, system: str, user: str, *, json_mode: bool = False) -> str | None:
        if not self._enabled or self._client is None:
            return None
        try:  # pragma: no cover
            kwargs: dict[str, Any] = {
                "model": settings.openai_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.3,
            }
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            resp = self._client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content
        except Exception as exc:  # noqa: BLE001
            logger.warning("AIClient: chat failed (%s); using fallback.", exc)
            return None

    # -- Module 1: summarisation ---------------------------------------------
    def summarize(self, headline: str, body: str = "") -> str:
        out = self._chat(
            "You summarise supply-chain news in one crisp sentence.",
            f"Headline: {headline}\n\n{body}",
        )
        return out.strip() if out else headline

    # -- Module 2: entity / event extraction ---------------------------------
    def extract_event(self, headline: str, body: str = "") -> dict[str, Any]:
        out = self._chat(
            "Extract a structured supply-chain disruption event as JSON with keys: "
            "type, location, country, companies (array), industries (array), "
            "products (array), duration_days (int), severity (critical|high|medium|low), "
            "confidence (0-1).",
            f"{headline}\n{body}",
            json_mode=True,
        )
        if out:
            try:
                return json.loads(out)
            except json.JSONDecodeError:
                pass
        return {}  # caller applies the rule-based extractor

    # -- Module 3: risk reasoning --------------------------------------------
    def risk_reasoning(self, context: dict[str, Any]) -> str:
        out = self._chat(
            "You are a supply-chain risk analyst. Explain the risk in 2-3 sentences, "
            "citing the dependency share, inventory coverage, and lack of alternates.",
            json.dumps(context),
        )
        return out.strip() if out else context.get("fallback_reasoning", "")

    # -- Module 5: email generation ------------------------------------------
    def generate_email(self, kind: str, context: dict[str, Any]) -> tuple[str, str]:
        out = self._chat(
            "You draft concise, professional business emails. Return JSON with "
            "keys 'subject' and 'body'.",
            f"Draft a {kind} email. Context: {json.dumps(context)}",
            json_mode=True,
        )
        if out:
            try:
                data = json.loads(out)
                return data.get("subject", ""), data.get("body", "")
            except json.JSONDecodeError:
                pass
        return "", ""  # caller applies template fallback

    # -- Module 6: executive report ------------------------------------------
    def executive_report(self, context: dict[str, Any]) -> str:
        out = self._chat(
            "You write a concise executive risk briefing (bulleted, <150 words).",
            json.dumps(context),
        )
        return out.strip() if out else context.get("fallback_report", "")


# Module-level singleton (cheap to share; stateless besides the client handle).
ai_client = AIClient()
