"""LLM adapter — the single seam between the app and any language model.

Provider selection (runtime): **NVIDIA Nemotron** > OpenAI > offline fallback.
NVIDIA is reached through its OpenAI-compatible endpoint, so the same `openai`
client drives both by swapping `base_url` + `api_key` + `model`.

Design goals:
  * The whole platform runs and demos with **no API key and no network** — every
    method has a deterministic, rule-based fallback.
  * All "AI modules" (summarisation, entity/event extraction, the news
    gatekeeper agent, risk reasoning, recommendations, email drafting, executive
    reports) sit behind this one interface (Dependency Inversion).
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _extract_json(text: str) -> Any | None:
    """Best-effort JSON parse — tolerates prose/markdown around the object.

    Nemotron and other models don't always honour strict JSON mode, so we also
    try to locate the first {...} or [...] block.
    """
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strip ```json fences and grab the first balanced-looking block.
    cleaned = re.sub(r"```(?:json)?", "", text)
    match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            return None
    return None


class AIClient:
    """Facade over an OpenAI-compatible LLM with graceful offline fallbacks."""

    def __init__(self) -> None:
        self._client: Any | None = None
        self.provider = "fallback"
        self.model = ""
        self._init_client()

    def _init_client(self) -> None:
        # Try NVIDIA Nemotron first, then fall back to OpenAI.
        tried_nvidia = False
        if settings.nvidia_api_key:
            tried_nvidia = True
            try:
                from openai import OpenAI

                self._client = OpenAI(
                    api_key=settings.nvidia_api_key,
                    base_url=settings.nvidia_base_url,
                    timeout=settings.ai_request_timeout,
                    max_retries=1,
                )
                self.provider = "nvidia"
                self.model = settings.nvidia_model
                logger.info("AIClient: NVIDIA enabled (model=%s).", self.model)
                return
            except Exception as exc:  # noqa: BLE001
                logger.warning("AIClient: NVIDIA init failed (%s); trying OpenAI...", exc)

        if settings.openai_api_key:
            try:
                from openai import OpenAI

                self._client = OpenAI(
                    api_key=settings.openai_api_key,
                    base_url=settings.openai_base_url,
                    timeout=settings.ai_request_timeout,
                    max_retries=1,
                )
                self.provider = "openai"
                self.model = settings.openai_model
                logger.info("AIClient: OpenAI enabled (model=%s).", self.model)
                return
            except Exception as exc:  # noqa: BLE001
                logger.warning("AIClient: OpenAI init failed (%s); using fallback.", exc)

        logger.info("AIClient: no working provider — using deterministic fallbacks.")

    @property
    def live(self) -> bool:
        return self._client is not None

    # -- low-level ------------------------------------------------------------
    def _chat(self, system: str, user: str, *, json_mode: bool = False, temperature: float = 0.3) -> str | None:
        if self._client is None:
            return None
        try:  # pragma: no cover
            kwargs: dict[str, Any] = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": temperature,
                "max_tokens": settings.ai_max_tokens,
            }
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            resp = self._client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content
        except Exception as exc:  # noqa: BLE001
            # Some endpoints reject response_format — retry once without it.
            if json_mode:
                try:
                    kwargs.pop("response_format", None)
                    resp = self._client.chat.completions.create(**kwargs)
                    return resp.choices[0].message.content
                except Exception:  # noqa: BLE001
                    pass
            logger.warning("AIClient: chat failed (%s); using fallback.", exc)
            return None

    def _extract_json(self, text: str) -> Any | None:
        """Instance wrapper for module-level _extract_json."""
        return _extract_json(text)

    # -- Module 1: summarisation ---------------------------------------------
    def summarize(self, headline: str, body: str = "") -> str:
        out = self._chat(
            "You summarise supply-chain news in one crisp, factual sentence.",
            f"Headline: {headline}\n\n{body}",
        )
        return out.strip() if out else headline

    # -- Agent: news gatekeeper (fake / irrelevant filter) -------------------
    def filter_news(self, headline: str, body: str = "") -> dict[str, Any] | None:
        """Judge a news item's credibility + supply-chain relevance.

        Returns {relevant, credible, is_supply_chain, confidence, reason} or
        None to let the caller apply the rule-based fallback.
        """
        out = self._chat(
            "You are a supply-chain intelligence gatekeeper agent. Assess whether "
            "a news item is (a) credible/real (not satire, rumour, spam, or "
            "clickbait) and (b) relevant to physical supply chains, logistics, "
            "trade, commodities, manufacturing, or disruptions. Respond ONLY with "
            "JSON: {\"relevant\": bool, \"credible\": bool, \"is_supply_chain\": "
            "bool, \"confidence\": 0-1, \"reason\": string}.",
            f"Headline: {headline}\n\nBody: {body}",
            json_mode=True,
            temperature=0.0,
        )
        data = _extract_json(out or "")
        return data if isinstance(data, dict) else None

    # -- Agent: reliability verifier -----------------------------------------
    def verify_news(self, headline: str, body: str = "", source: str = "") -> dict[str, Any] | None:
        """Judge whether a news item is supported + reliable (not rumour/spam).

        Returns {reliable, supported, confidence, reason, red_flags} or None to
        let the caller apply the rule-based fallback.
        """
        out = self._chat(
            "You are a news reliability verifier for a supply-chain risk platform. "
            "Assess whether the item is SUPPORTED (concrete, verifiable reporting of "
            "an actual event with attributable specifics — not vague, hypothetical, "
            "or opinion) and RELIABLE (a credible outlet; not rumour, speculation, "
            "satire, clickbait, or an unconfirmed single-source claim). Respond ONLY "
            "with JSON: {\"reliable\": bool, \"supported\": bool, \"confidence\": 0-1, "
            "\"reason\": string, \"red_flags\": [string]}.",
            f"Source: {source}\nHeadline: {headline}\n\nBody: {body}",
            json_mode=True,
            temperature=0.0,
        )
        data = _extract_json(out or "")
        return data if isinstance(data, dict) else None

    # -- Agent: company-relevance extractor ----------------------------------
    def assess_relevance(self, headline: str, body: str, profile: dict[str, Any]) -> dict[str, Any] | None:
        """Decide whether news is relevant to THIS company's supply-chain paths.

        ``profile`` describes the company's Digital Twin (suppliers, components,
        products, factories, countries, routes). Returns {relevant, confidence,
        reason, matched} or None for the caller's fallback.
        """
        out = self._chat(
            "You are a supply-chain relevance analyst. Given a company's supply-chain "
            "profile and a news item, decide whether the news RELEVANT to this "
            "specific company. It is relevant only if it plausibly affects a NAMED "
            "asset — one of its suppliers, the components/commodities it depends on, "
            "its products, its production sites/warehouses, or its logistics "
            "routes/ports — OR describes a real disruption (war, export control, "
            "sanction, strike, disaster, port closure, shortage, etc.) in a country "
            "listed under 'asset_countries' (where the company holds a physical "
            "asset). CRITICAL: geography ALONE is NOT enough — a story that merely "
            "happens in a country the company operates in, with no link to one of "
            "its assets or no actual disruption, is NOT relevant. General industry "
            "news is NOT relevant. Respond ONLY with JSON: {\"relevant\": bool, "
            "\"confidence\": 0-1, \"reason\": string, \"matched\": [string]} where "
            "matched lists the specific company assets or asset-country disruptions "
            "the news touches.",
            "COMPANY SUPPLY-CHAIN PROFILE:\n" + json.dumps(profile)
            + f"\n\nNEWS:\nHeadline: {headline}\nBody: {body}",
            json_mode=True,
            temperature=0.0,
        )
        data = _extract_json(out or "")
        return data if isinstance(data, dict) else None

    # -- Module 2: entity / event extraction ---------------------------------
    def extract_event(self, headline: str, body: str = "") -> dict[str, Any]:
        out = self._chat(
            "Extract a structured supply-chain disruption event as JSON with keys: "
            "type, location, country, companies (array), industries (array), "
            "products (array), duration_days (int), severity "
            "(critical|high|medium|low), confidence (0-1). Respond ONLY with JSON.",
            f"{headline}\n{body}",
            json_mode=True,
            temperature=0.0,
        )
        data = _extract_json(out or "")
        return data if isinstance(data, dict) else {}

    # -- Module 3b: quantitative risk assessment -----------------------------
    def assess_risk(self, context: dict[str, Any]) -> dict[str, Any] | None:
        """Produce the numeric risk metrics (score, revenue at risk, impact).

        The deterministic baseline is provided in the context to ground the model;
        it may adjust within reason. Returns a dict or None (caller falls back).
        Keys: score(0-100), severity, confidence(0-1), revenue_at_risk(number),
        factors[{label,value 0-100}], impact[{label,value string}].
        """
        out = self._chat(
            "You are a supply-chain risk quantification agent. Using the event and "
            "Digital Twin context (with a deterministic baseline), return refined "
            "metrics as JSON ONLY: {\"score\": int 0-100, \"severity\": "
            "critical|high|medium|low, \"confidence\": 0-1, \"revenue_at_risk\": "
            "number (USD), \"factors\": [{\"label\": string, \"value\": int 0-100}], "
            "\"impact\": [{\"label\": string, \"value\": string}]}. Keep values "
            "realistic and consistent with the baseline order of magnitude.",
            json.dumps(context),
            json_mode=True,
            temperature=0.1,
        )
        data = _extract_json(out or "")
        return data if isinstance(data, dict) else None

    # -- Module 3: risk reasoning --------------------------------------------
    def risk_reasoning(self, context: dict[str, Any]) -> str:
        out = self._chat(
            "You are a supply-chain risk analyst. Explain the risk in 2-3 sentences, "
            "citing the dependency share, inventory coverage, and lack of alternates.",
            json.dumps(context),
        )
        return out.strip() if out else context.get("fallback_reasoning", "")

    # -- Module 4: recommendation agent --------------------------------------
    def recommend_actions(self, context: dict[str, Any]) -> list[dict[str, Any]] | None:
        """Generate prioritised mitigation actions. Returns a list or None."""
        out = self._chat(
            "You are a supply-chain mitigation planner. Given a scored risk and "
            "candidate scenarios, output 2-4 prioritised actions as a JSON array. "
            "Each item: {\"title\": string, \"priority\": "
            "critical|high|medium|low, \"department\": string, "
            "\"estimated_benefit\": string, \"estimated_cost\": string, "
            "\"horizon\": immediate|short_term|long_term, \"days_to_deadline\": "
            "int}. Respond ONLY with the JSON array.",
            json.dumps(context),
            json_mode=True,
        )
        data = _extract_json(out or "")
        return data if isinstance(data, list) else None

    # -- Module 5: email generation ------------------------------------------
    def generate_email(self, kind: str, context: dict[str, Any]) -> tuple[str, str]:
        out = self._chat(
            "You draft concise, professional business emails for supply-chain "
            "operations. Respond ONLY with JSON: {\"subject\": string, "
            "\"body\": string}.",
            f"Draft a {kind} email. Context: {json.dumps(context)}",
            json_mode=True,
            temperature=0.4,
        )
        data = _extract_json(out or "")
        if isinstance(data, dict) and data.get("subject") and data.get("body"):
            return str(data["subject"]), str(data["body"])
        return "", ""

    # -- Module 6: executive report ------------------------------------------
    def executive_report(self, context: dict[str, Any]) -> str:
        out = self._chat(
            "You write a concise executive risk briefing (bulleted, <150 words).",
            json.dumps(context),
        )
        return out.strip() if out else context.get("fallback_report", "")


# Module-level singleton (cheap to share; stateless besides the client handle).
ai_client = AIClient()
