"""Scenario Simulator (spec module 11 + AI module 4) — RAG-enhanced.

Given a risk, simulate candidate mitigation strategies tailored to:
- the specific disruption type (earthquake, port congestion, cyberattack, etc.)
- the supplier's attributes (alt suppliers, dependency, location)
- the company's digital twin (coverage days, product revenue, factory capacity)
- retrieved knowledge from the RAG corpus (best practices, case studies, playbooks)

Falls back to deterministic templates when no LLM or no RAG corpus.
"""
from __future__ import annotations

import json
import re
import logging
from dataclasses import dataclass
from typing import Any

from app.core.logging import get_logger
from app.models.entities import Risk
from app.services.ai.adapter import ai_client
from app.services.rag import get_rag_service, RetrievalResult
from app.services.monte_carlo import MonteCarloService

logger = get_logger(__name__)


_REFERENCE_LOSS = 2_400_000.0


@dataclass(frozen=True)
class _Template:
    id: str
    name: str
    reduction: float          # 0-1
    cost_ref: float           # $ at the reference loss
    recovery_weeks: int
    financial_ref: float      # net $ impact at reference loss (negative)


# Fallback deterministic templates (used when AI unavailable or RAG empty)
_TEMPLATES: list[_Template] = [
    _Template("none", "No Action", 0.0, 0.0, 6, -2_400_000),
    _Template("switch", "Switch Supplier", 0.64, 180_000, 3, -620_000),
    _Template("air", "Use Air Freight", 0.41, 95_000, 2, -980_000),
    _Template("inventory", "Increase Safety Stock", 0.37, 140_000, 5, -1_100_000),
]


# Event-type specific strategy adjustments
_EVENT_STRATEGY_MODS: dict[str, dict[str, dict[str, float]]] = {
    "earthquake": {
        "switch": {"reduction": 0.15, "cost": 1.5, "recovery": 1.5},
        "air": {"reduction": -0.1, "cost": 2.0, "recovery": 0.5},
        "inventory": {"reduction": 0.05, "cost": 1.2, "recovery": 1.0},
    },
    "factory_fire": {
        "switch": {"reduction": 0.1, "cost": 1.3, "recovery": 1.2},
        "air": {"reduction": 0.05, "cost": 1.8, "recovery": 0.8},
        "inventory": {"reduction": 0.1, "cost": 1.0, "recovery": 1.0},
    },
    "port_congestion": {
        "switch": {"reduction": -0.05, "cost": 1.2, "recovery": 1.0},
        "air": {"reduction": 0.2, "cost": 1.5, "recovery": -0.5},
        "inventory": {"reduction": 0.15, "cost": 1.1, "recovery": 0.5},
    },
    "strike": {
        "switch": {"reduction": 0.1, "cost": 1.1, "recovery": 1.0},
        "air": {"reduction": 0.1, "cost": 1.3, "recovery": 0.5},
        "inventory": {"reduction": 0.05, "cost": 1.0, "recovery": 1.0},
    },
    "cyberattack": {
        "switch": {"reduction": -0.1, "cost": 1.5, "recovery": 1.5},
        "air": {"reduction": -0.2, "cost": 1.2, "recovery": 1.0},
        "inventory": {"reduction": 0.0, "cost": 1.0, "recovery": 1.0},
    },
    "export_restriction": {
        "switch": {"reduction": 0.2, "cost": 1.8, "recovery": 2.0},
        "air": {"reduction": -0.15, "cost": 1.5, "recovery": 1.0},
        "inventory": {"reduction": 0.1, "cost": 1.2, "recovery": 1.5},
    },
    "commodity_price": {
        "switch": {"reduction": 0.1, "cost": 1.2, "recovery": 1.0},
        "air": {"reduction": -0.1, "cost": 1.1, "recovery": 1.0},
        "inventory": {"reduction": 0.15, "cost": 1.3, "recovery": 0.5},
    },
    "weather": {
        "switch": {"reduction": 0.05, "cost": 1.2, "recovery": 1.0},
        "air": {"reduction": 0.1, "cost": 1.4, "recovery": 0.5},
        "inventory": {"reduction": 0.1, "cost": 1.1, "recovery": 1.0},
    },
}


def _money(value: float) -> str:
    v = abs(value)
    sign = "-" if value < 0 else ""
    if v >= 1_000_000:
        return f"{sign}${v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"{sign}${v / 1_000:.0f}K"
    return f"{sign}${v:.0f}"


def _pct(value: float) -> str:
    return f"{int(round(value * 100))}%"


def _parse_money(text: str) -> float:
    if not text:
        return 0.0
    sign = -1.0 if "-" in text else 1.0
    m = re.search(r"(\d+(?:\.\d+)?)\s*([KMB])?", text.replace(",", ""), re.IGNORECASE)
    if not m:
        return 0.0
    val = float(m.group(1))
    mult = {"k": 1e3, "m": 1e6, "b": 1e9}.get((m.group(2) or "").lower(), 1.0)
    return sign * val * mult


def _parse_pct(text: str) -> float:
    m = re.search(r"(\d+(?:\.\d+)?)", text or "")
    return (float(m.group(1)) / 100.0) if m else 0.0


class ScenarioService:
    def __init__(self) -> None:
        self.monte_carlo = MonteCarloService()
        self.rag = get_rag_service()

    def simulate(
        self,
        risk: Risk,
        twin_nodes: list[Any] = None,
        twin_edges: list[Any] = None,
    ) -> list[dict]:
        """Generate tailored mitigation scenarios for a specific risk.

        Args:
            risk: The Risk entity with all its metadata (event, supplier, impact, etc.)
            twin_nodes: Optional Digital Twin nodes for deeper context
            twin_edges: Optional Digital Twin edges for cascade context

        Returns:
            List of scenario dicts with id, name, risk_reduction, cost, recovery, financial, rank
        """
        # 1. Extract risk context
        context = self._build_context(risk, twin_nodes, twin_edges)

        # 2. Try RAG + AI generation
        scenarios = self._generate_with_ai(context)
        if scenarios:
            return scenarios

        # 3. Fallback: deterministic template + event-type adjustments
        return self._generate_deterministic(context)

    def _build_context(
        self,
        risk: Risk,
        twin_nodes: list[Any] = None,
        twin_edges: list[Any] = None,
    ) -> dict[str, Any]:
        """Build rich context dictionary for RAG query and AI prompt."""
        event_type = self._infer_event_type(risk)
        event_country = self._infer_event_country(risk)

        # Supplier attributes from factors/impact
        supplier_attrs = {}
        for f in risk.factors or []:
            label = f.get("label", "")
            val = f.get("value", 0)
            if "Alternative" in label and "Supplier" in label:
                supplier_attrs["alt_suppliers"] = int(val)
            if "Dependency" in label:
                supplier_attrs["dependency_share"] = val / 100.0

        # Inventory coverage from impact tiles
        coverage_days = 21
        for t in risk.impact or []:
            if "Inventory Coverage" in t.get("label", ""):
                m = re.search(r"(\d+(?:\.\d+)?)", t.get("value", ""))
                if m:
                    coverage_days = float(m.group(1))
                break

        # Revenue at risk
        revenue_at_risk = risk.revenue_at_risk or _REFERENCE_LOSS

        # Monte Carlo stoppage probability
        stoppage_prob = 0.0
        if twin_nodes and twin_edges:
            try:
                supplier_attrs_twin, coverage_hint = self.monte_carlo.twin_context(
                    twin_nodes, twin_edges, risk.supplier
                )
                mc_inputs = self.monte_carlo.inputs_from_risk(
                    risk, supplier_attrs_twin, coverage_hint, event_type
                )
                stoppage_prob = self.monte_carlo.stoppage_probability(mc_inputs)
            except Exception:
                pass

        return {
            "risk_id": risk.id,
            "event_type": event_type,
            "event_country": event_country,
            "supplier": risk.supplier,
            "supplier_attrs": supplier_attrs,
            "coverage_days": coverage_days,
            "revenue_at_risk": revenue_at_risk,
            "risk_score": risk.score,
            "risk_severity": risk.severity.value if risk.severity else "medium",
            "stoppage_probability": stoppage_prob,
            "impact_tiles": risk.impact,
            "factors": risk.factors,
            "chain": risk.chain,
            "reasoning": risk.reasoning,
        }

    def _infer_event_type(self, risk: Risk) -> str:
        """Infer event type from risk data."""
        # Check impact tiles
        for t in risk.impact or []:
            label = t.get("label", "").lower()
            if "earthquake" in label or "seismic" in label:
                return "earthquake"
            if "port" in label or "congestion" in label or "shipping" in label:
                return "port_congestion"
            if "fire" in label:
                return "factory_fire"
            if "strike" in label or "labour" in label or "labor" in label:
                return "strike"
            if "cyber" in label or "ransomware" in label or "hack" in label:
                return "cyberattack"
            if "export" in label or "sanction" in label or "tariff" in label:
                return "export_restriction"
            if "price" in label or "commodity" in label or "spike" in label:
                return "commodity_price"
            if "weather" in label or "typhoon" in label or "hurricane" in label or "flood" in label:
                return "weather"

        # Check chain
        chain_text = " ".join(risk.chain or []).lower()
        if "earthquake" in chain_text:
            return "earthquake"
        if "port" in chain_text or "congestion" in chain_text:
            return "port_congestion"
        if "fire" in chain_text:
            return "factory_fire"
        if "strike" in chain_text:
            return "strike"
        if "cyber" in chain_text:
            return "cyberattack"
        if "export" in chain_text:
            return "export_restriction"
        if "price" in chain_text or "commodity" in chain_text:
            return "commodity_price"
        if "weather" in chain_text or "typhoon" in chain_text:
            return "weather"

        return "disruption"

    def _infer_event_country(self, risk: Risk) -> str:
        """Infer event country from risk data."""
        # Check chain for country names
        chain_text = " ".join(risk.chain or [])
        countries = ["Taiwan", "China", "Japan", "USA", "United States", "Vietnam", "Malaysia",
                     "Netherlands", "Germany", "Egypt", "Philippines", "Korea", "South Korea",
                     "India", "Poland", "France", "Italy", "Spain", "Mexico", "Brazil", "Canada",
                     "United Kingdom", "UK", "Indonesia", "Thailand", "Turkey", "Singapore",
                     "Australia", "Bangladesh", "Ukraine", "Russia", "Saudi Arabia", "UAE"]
        for c in countries:
            if c.lower() in chain_text.lower():
                return c
        return risk.supplier.split()[-1] if risk.supplier else ""

    def _generate_with_ai(self, context: dict[str, Any]) -> list[dict] | None:
        """Use RAG + LLM to generate tailored mitigation strategies."""
        # Debug: AI client status
        logger.info(
            "Scenario AI check: live=%s, provider=%s, model=%s",
            ai_client.live, ai_client.provider, ai_client.model or "none"
        )
        if not ai_client.live:
            logger.warning("AI client not live — falling back to deterministic")
            return None

        # Debug: RAG status
        rag_chunks = len(self.rag.chunks) if self.rag.chunks else 0
        rag_indexed = self.rag.index is not None
        logger.info(
            "RAG status: chunks=%d, indexed=%s, sources=%s",
            rag_chunks, rag_indexed,
            list(set(c.source for c in self.rag.chunks)) if self.rag.chunks else []
        )
        if rag_chunks == 0:
            logger.warning("RAG empty — no knowledge base ingested, falling back to deterministic")
            return None

        # 1. Retrieve relevant knowledge from RAG
        rag_query = self._build_rag_query(context)
        logger.debug("RAG query: %s", rag_query)
        rag_results: list[RetrievalResult] = self.rag.retrieve(rag_query, top_k=5)
        logger.info(
            "RAG retrieved %d results for query",
            len(rag_results)
        )
        for i, r in enumerate(rag_results):
            logger.debug(
                "RAG result %d: source=%s, score=%.3f, text_preview=%s",
                i, r.chunk.source, r.combined_score, r.chunk.text[:100]
            )
        if not rag_results:
            logger.warning("RAG retrieval returned empty — falling back to deterministic")
            return None

        rag_context = self._format_rag_context(rag_results)

        # 2. Build prompt with risk context + RAG knowledge
        prompt = self._build_ai_prompt(context, rag_context)
        logger.debug("AI prompt length: %d chars", len(prompt))

        # 3. Call LLM
        try:
            out = ai_client._chat(
                system="You are a supply-chain mitigation strategist. Generate tailored mitigation scenarios as JSON only.",
                user=prompt,
                json_mode=True,
                temperature=0.2,
            )
            if not out:
                logger.warning("AI returned empty response (likely timeout)")
                return None

            data = ai_client._extract_json(out)
            if not data or "scenarios" not in data:
                logger.warning("AI response missing 'scenarios' key: %s", data)
                return None

            scenarios = data["scenarios"]
            logger.info("AI generated %d scenarios", len(scenarios))
            for i, s in enumerate(scenarios):
                logger.debug(
                    "AI scenario %d: id=%s, name=%s, reduction=%s, cost=%s, recovery=%s, financial=%s",
                    i, s.get("id"), s.get("name"), s.get("risk_reduction"), s.get("cost"),
                    s.get("recovery_weeks"), s.get("financial_impact")
                )

            # Validate and format
            formatted = []
            for i, s in enumerate(scenarios):
                formatted.append({
                    "id": s.get("id", f"ai_{i}"),
                    "name": s.get("name", f"AI Strategy {i+1}"),
                    "risk_reduction": _pct(_parse_pct(s.get("risk_reduction", "50%"))),
                    "cost": _money(_parse_money(s.get("cost", "$100K"))),
                    "recovery": f"{int(s.get('recovery_weeks', 4))} weeks",
                    "financial": _money(_parse_money(s.get("financial_impact", "-$500K"))),
                    "rationale": s.get("rationale", ""),
                    "source": "ai_rag",
                })
            return formatted
        except Exception as e:
            logger.exception("AI scenario generation failed: %s", e)
            return None

    def _build_rag_query(self, context: dict[str, Any]) -> str:
        """Build a focused query for RAG retrieval."""
        parts = [
            f"supply chain mitigation {context['event_type']}",
            f"supplier {context['supplier']}",
            "risk reduction strategies",
        ]
        if context["coverage_days"] < 21:
            parts.append("low inventory coverage")
        if context.get("supplier_attrs", {}).get("alt_suppliers", 0) == 0:
            parts.append("single source supplier no alternatives")
        return " ".join(parts)

    def _format_rag_context(self, results: list[RetrievalResult]) -> str:
        """Format RAG results for prompt injection."""
        chunks = []
        for r in results:
            c = r.chunk
            prefix = f"[Source: {c.source}"
            if c.page:
                prefix += f", p.{c.page}"
            if c.section:
                prefix += f", §{c.section}"
            prefix += f" | Relevance: {r.combined_score:.2f}]"
            chunks.append(f"{prefix}\n{c.text}")
        return "\n---\n".join(chunks)

    def _build_ai_prompt(self, context: dict[str, Any], rag_context: str) -> str:
        """Build the prompt for AI scenario generation."""
        revenue = context["revenue_at_risk"]

        return f"""Generate 3-4 tailored supply-chain mitigation scenarios for this specific risk.

RISK CONTEXT:
- Event Type: {context['event_type'].replace('_', ' ').title()}
- Country/Region: {context['event_country']}
- Supplier: {context['supplier']}
- Supplier Dependency: {context['supplier_attrs'].get('dependency_share', 0):.0%}
- Alternative Suppliers: {context['supplier_attrs'].get('alt_suppliers', 0)}
- Inventory Coverage: {context['coverage_days']} days
- Revenue at Risk: ${revenue:,.0f}
- Risk Score: {context['risk_score']}/100 ({context['risk_severity']})
- Production Stoppage Probability: {context['stoppage_probability']:.0%}
- Impact Tiles: {json.dumps(context['impact_tiles'])}
- Risk Factors: {json.dumps(context['factors'])}
- Cascade Chain: {json.dumps(context['chain'])}

RELEVANT KNOWLEDGE (from case studies, best practices, playbooks):
{rag_context}

TASK:
Generate mitigation scenarios tailored to THIS SPECIFIC disruption type and supplier context.
Consider: event physics (earthquake=physical damage, port=logistics, cyber=digital, etc.),
supplier alternatives, inventory reality, geographic constraints.

RESPOND WITH JSON ONLY:
{{
  "scenarios": [
    {{
      "id": "unique_id",
      "name": "Descriptive Strategy Name",
      "risk_reduction": 0.0-1.0,
      "cost": number_usd,
      "recovery_weeks": integer,
      "financial_impact": number_usd,  // net impact (negative = loss)
      "rationale": "Why this fits this specific disruption type and context"
    }}
  ]
}}

Guidelines:
- Strategies must be specific to {context['event_type']} disruptions
- Cost should scale with revenue_at_risk (reference $2.4M)
- Risk reduction must reflect real feasibility given alternatives/coverage
- Include rationale referencing the specific context
- No generic "Switch Supplier" if 0 alternatives exist
"""

    def _generate_deterministic(self, context: dict[str, Any]) -> list[dict]:
        """Deterministic fallback: templates adjusted by event type + context."""
        event_type = context["event_type"]
        mods = _EVENT_STRATEGY_MODS.get(event_type, {})
        scale = context["revenue_at_risk"] / _REFERENCE_LOSS

        # Adjust for inventory coverage
        coverage = context["coverage_days"]
        coverage_factor = max(0.5, min(2.0, 21.0 / max(1.0, coverage)))

        # Adjust for alternatives
        alt_suppliers = context["supplier_attrs"].get("alt_suppliers", 0)
        alt_factor = 1.0 - min(0.3, alt_suppliers * 0.1)

        out = []
        for t in _TEMPLATES:
            mod = mods.get(t.id, {})
            reduction = t.reduction
            cost = t.cost_ref
            recovery = t.recovery_weeks
            financial = t.financial_ref

            # Apply event-type modifiers
            if mod.get("reduction"):
                reduction += mod["reduction"]
            if mod.get("cost"):
                cost *= mod["cost"]
            if mod.get("recovery"):
                recovery = max(1, int(recovery * mod["recovery"]))

            # Apply context modifiers
            if t.id == "inventory":
                reduction *= coverage_factor
            if t.id == "switch":
                reduction *= alt_factor
                if alt_suppliers == 0:
                    reduction *= 0.3
                    cost *= 3.0

            # Scale costs and financials by revenue
            cost *= scale
            financial *= scale

            # Clamp
            reduction = max(0.0, min(0.95, reduction))
            recovery = max(1, min(12, recovery))

            out.append({
                "id": t.id,
                "name": t.name,
                "risk_reduction": _pct(reduction),
                "cost": _money(cost),
                "recovery": f"{recovery} weeks",
                "financial": _money(financial),
                "rationale": f"Deterministic estimate for {event_type} with {coverage:.0f}d coverage, {alt_suppliers} alt suppliers",
                "source": "deterministic",
            })

        return out

    def get(self, risk: Risk, scenario_id: str, twin_nodes: list[Any] = None, twin_edges: list[Any] = None) -> dict | None:
        """Get a specific scenario by ID."""
        scenarios = self.simulate(risk, twin_nodes, twin_edges)
        return next((s for s in scenarios if s["id"] == scenario_id), None)