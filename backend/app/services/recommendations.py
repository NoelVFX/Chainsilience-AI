"""AI Recommendation Agent (spec module 12).

Turns a scored risk + simulated scenarios into prioritised, ownable actions
(immediate / short-term / long-term) with benefit, cost, department and deadline.
"""
from __future__ import annotations

from datetime import timedelta
from dataclasses import dataclass

from app.core.logging import get_logger
from app.models.entities import ActionStatus, Risk, Severity
from app.models.entities import _utcnow
from app.services.ai.adapter import ai_client
from app.services.scenario import ScenarioService

logger = get_logger(__name__)


@dataclass
class Recommendation:
    title: str
    priority: Severity
    department: str
    estimated_benefit: str
    estimated_cost: str
    deadline: str
    horizon: str  # immediate | short_term | long_term


class RecommendationService:
    def __init__(self, scenario_service: ScenarioService) -> None:
        self.scenario_service = scenario_service

    def recommend(self, risk: Risk) -> list[Recommendation]:
        scenarios = {s["id"]: s for s in self.scenario_service.simulate(risk)}

        # AI path (Nemotron): generate contextual, prioritised actions.
        ai_recs = self._ai_recommendations(risk, list(scenarios.values()))
        if ai_recs:
            return ai_recs

        return self._deterministic(risk, scenarios)

    def _ai_recommendations(self, risk: Risk, scenarios: list[dict]) -> list[Recommendation]:
        raw = ai_client.recommend_actions(
            {
                "risk_title": risk.title,
                "severity": risk.severity.value,
                "score": risk.score,
                "revenue_at_risk": risk.revenue_at_risk,
                "supplier": risk.supplier,
                "reasoning": risk.reasoning,
                "scenarios": scenarios,
            }
        )
        if not raw:
            return []
        base = _utcnow()
        out: list[Recommendation] = []
        for item in raw[:4]:
            try:
                priority = Severity(str(item.get("priority", "medium")).lower())
            except ValueError:
                priority = Severity.MEDIUM
            days = int(item.get("days_to_deadline", 7) or 7)
            out.append(
                Recommendation(
                    title=str(item.get("title", "Mitigation action")),
                    priority=priority,
                    department=str(item.get("department", "Operations")),
                    estimated_benefit=str(item.get("estimated_benefit", "")),
                    estimated_cost=str(item.get("estimated_cost", "")),
                    deadline=(base + timedelta(days=days)).strftime("%b %d"),
                    horizon=str(item.get("horizon", "short_term")),
                )
            )
        if out:
            logger.info("Recommendation agent (%s) produced %d actions.", ai_client.provider, len(out))
        return out

    def _deterministic(self, risk: Risk, scenarios: dict) -> list[Recommendation]:
        base = _utcnow()

        def deadline(days: int) -> str:
            return (base + timedelta(days=days)).strftime("%b %d")

        recs: list[Recommendation] = []
        # Immediate: customer comms always warranted for critical/high risk.
        if risk.severity in {Severity.CRITICAL, Severity.HIGH}:
            recs.append(
                Recommendation(
                    f"Draft customer notification — {risk.title}",
                    Severity.HIGH, "Customer Success",
                    "Protect key accounts", "$0", deadline(1), "immediate",
                )
            )
        # Short-term: the best mitigation scenario (highest reduction that isn't 'none').
        best = max(
            (s for s in scenarios.values() if s["id"] != "none"),
            key=lambda s: int(s["risk_reduction"].rstrip("%")),
            default=None,
        )
        if best:
            recs.append(
                Recommendation(
                    f"{best['name']} — {risk.title}",
                    Severity.CRITICAL if risk.severity == Severity.CRITICAL else Severity.HIGH,
                    "Procurement", f"{best['risk_reduction']} risk reduction",
                    best["cost"], deadline(3), "short_term",
                )
            )
        # Long-term: resilience — qualify an alternate supplier / raise safety stock.
        recs.append(
            Recommendation(
                "Qualify alternate supplier & raise safety stock",
                Severity.MEDIUM, "Operations",
                "Structural resilience", scenarios["inventory"]["cost"],
                deadline(21), "long_term",
            )
        )
        return recs

    @staticmethod
    def initial_status() -> ActionStatus:
        return ActionStatus.RECOMMENDED
