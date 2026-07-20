"""Risk Scoring Engine (spec module 9) — explainable, factor-based scoring.

Produces a 0-100 composite score plus the individual factor breakdown the UI
renders as progress bars, so every score is fully explainable.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.models.entities import Event, Node, Severity

_SEVERITY_WEIGHT = {
    Severity.CRITICAL: 92,
    Severity.HIGH: 74,
    Severity.MEDIUM: 55,
    Severity.LOW: 30,
}

# Relative weight of each factor in the composite score (sums to 1.0).
_FACTOR_WEIGHTS = {
    "Event Severity": 0.30,
    "Supplier Dependency": 0.25,
    "Inventory Coverage": 0.15,
    "Alternative Suppliers": 0.15,
    "Geographic Exposure": 0.15,
}


@dataclass
class ScoreResult:
    score: int
    severity: Severity
    confidence: float
    factors: list[dict]


class RiskScoringService:
    def score(self, event: Event, supplier: Node, coverage_days: int = 21) -> ScoreResult:
        dep = float(supplier.attributes.get("dependency_share", 0.4))
        alt = int(supplier.attributes.get("alt_suppliers", 1))

        factors = {
            "Event Severity": _SEVERITY_WEIGHT[event.severity],
            "Supplier Dependency": round(dep * 100),
            # Less coverage => higher risk contribution.
            "Inventory Coverage": max(0, 100 - min(coverage_days, 60) * 100 // 60),
            # More alternates => lower risk contribution.
            "Alternative Suppliers": max(10, 100 - alt * 30),
            "Geographic Exposure": 76 if event.country in {"Taiwan", "China"} else 50,
        }

        composite = sum(factors[k] * w for k, w in _FACTOR_WEIGHTS.items())
        score = int(round(composite))
        severity = self._band(score)
        confidence = round(min(0.95, 0.55 + event.confidence * 0.4), 2)

        factor_list = [{"label": k, "value": int(v)} for k, v in factors.items()]
        return ScoreResult(score=score, severity=severity, confidence=confidence, factors=factor_list)

    @staticmethod
    def _band(score: int) -> Severity:
        if score >= 80:
            return Severity.CRITICAL
        if score >= 65:
            return Severity.HIGH
        if score >= 45:
            return Severity.MEDIUM
        return Severity.LOW
