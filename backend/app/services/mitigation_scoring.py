"""Deterministic multi-objective mitigation comparison.

Ranks mitigation options (No Action / Switch Supplier / Air Freight / Increase
Safety Stock …) by a weighted utility:

    U(a) = βS·Service(a) + βF·NetFinancialImpact(a)
         + βR·ReducedRisk(a) − βI·ImplementationCost(a)

where each objective is min-max normalised to 0–1 across the candidate set so the
weights are comparable. The user's chosen priority raises that objective's weight,
so the option that best serves the priority gets the highest U and sorts first.
Purely deterministic — same inputs always yield the same ranking.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# β weights per priority. Every objective keeps a base weight of 1.0; the
# prioritised objective is amplified so it dominates the ranking.
_BASE = {"service": 1.0, "financial": 1.0, "risk": 1.0, "cost": 1.0}
_AMPLIFIED = 4.0
_PRIORITIES = {
    "balanced": _BASE,
    "recovery": {**_BASE, "service": _AMPLIFIED},     # shortest service recovery
    "financial": {**_BASE, "financial": _AMPLIFIED},  # best net financial impact
    "risk": {**_BASE, "risk": _AMPLIFIED},            # most reduced risk
    "cost": {**_BASE, "cost": _AMPLIFIED},            # lowest implementation cost
}


def _money(text: str) -> float:
    """Parse "$180K" / "-$1.1M" / "$0" → float dollars."""
    if not text:
        return 0.0
    sign = -1.0 if "-" in text else 1.0
    m = re.search(r"(\d+(?:\.\d+)?)\s*([KMB])?", text.replace(",", ""), re.IGNORECASE)
    if not m:
        return 0.0
    value = float(m.group(1))
    mult = {"k": 1e3, "m": 1e6, "b": 1e9}.get((m.group(2) or "").lower(), 1.0)
    return sign * value * mult


def _pct(text: str) -> float:
    m = re.search(r"(\d+(?:\.\d+)?)", text or "")
    return (float(m.group(1)) / 100.0) if m else 0.0


def _weeks(text: str) -> float:
    m = re.search(r"(\d+(?:\.\d+)?)", text or "")
    return float(m.group(1)) if m else 0.0


def _minmax(values: list[float]) -> list[float]:
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return [0.5 for _ in values]  # all equal → neutral
    return [(v - lo) / (hi - lo) for v in values]


@dataclass
class _Terms:
    service: float       # higher = faster recovery (better)
    financial: float     # higher = less negative net impact (better)
    reduced_risk: float  # higher = more risk removed (better)
    impl_cost: float     # higher = more expensive (worse; subtracted)


class MitigationScorer:
    PRIORITIES = tuple(_PRIORITIES.keys())

    def rank(self, scenarios: list[dict], priority: str = "balanced") -> list[dict]:
        if not scenarios:
            return []
        weights = _PRIORITIES.get(priority, _BASE)

        reductions = [_pct(s["risk_reduction"]) for s in scenarios]
        costs = [_money(s["cost"]) for s in scenarios]
        recoveries = [_weeks(s["recovery"]) for s in scenarios]
        financials = [_money(s["financial"]) for s in scenarios]

        # Normalise each objective to 0-1 (higher = better for that objective).
        risk_n = _minmax(reductions)
        # Service: shorter recovery is better → invert.
        service_n = _minmax([-r for r in recoveries])
        fin_n = _minmax(financials)  # less negative is already larger → better
        cost_n = _minmax(costs)      # higher cost = worse; subtracted below

        # Debug logging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(
            "Mitigation ranking: priority=%s, weights=%s, "
            "reductions=%s, costs=%s, recoveries=%s, financials=%s",
            priority, weights, reductions, costs, recoveries, financials
        )
        logger.info(
            "Normalized: risk_n=%s, service_n=%s, fin_n=%s, cost_n=%s",
            risk_n, service_n, fin_n, cost_n
        )

        utilities: list[float] = []
        for i in range(len(scenarios)):
            u = (
                weights["service"] * service_n[i]
                + weights["financial"] * fin_n[i]
                + weights["risk"] * risk_n[i]
                - weights["cost"] * cost_n[i]
            )
            utilities.append(u)
            logger.info(
                "Scenario %s (%s): utility=%.4f (service=%.3f, fin=%.3f, risk=%.3f, cost=%.3f)",
                scenarios[i].get("id"), scenarios[i].get("name"), u,
                service_n[i], fin_n[i], risk_n[i], cost_n[i]
            )

        # Present a relative 0-100 fit score (best option = 100).
        score_n = _minmax(utilities)
        ranked = []
        for i, s in enumerate(scenarios):
            ranked.append({**s, "utility": round(utilities[i], 4),
                           "score": round(score_n[i] * 100)})
        ranked.sort(key=lambda s: s["utility"], reverse=True)
        for rank, s in enumerate(ranked, start=1):
            s["rank"] = rank
        return ranked
