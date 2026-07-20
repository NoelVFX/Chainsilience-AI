"""AI Recommendation Agent (spec module 12).

Turns a scored risk + simulated scenarios into prioritised, ownable actions
(immediate / short-term / long-term) with benefit, cost, department and deadline.
"""
from __future__ import annotations

from datetime import timedelta
from dataclasses import dataclass

from app.models.entities import ActionStatus, Risk, Severity
from app.models.entities import _utcnow
from app.services.scenario import ScenarioService


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
