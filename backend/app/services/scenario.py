"""Scenario Simulator (spec module 11 + AI module 4).

Given a risk, simulate candidate mitigation strategies and compare them on risk
reduction, implementation cost, recovery time and net financial impact.

Templates are anchored to a $2.4M reference loss (matching the design handoff)
and scale proportionally to each risk's revenue at risk, so the numbers stay
coherent for any risk while reproducing the reference figures exactly.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.models.entities import Risk

_REFERENCE_LOSS = 2_400_000.0


@dataclass(frozen=True)
class _Template:
    id: str
    name: str
    reduction: float          # 0-1
    cost_ref: float           # $ at the reference loss
    recovery_weeks: int
    financial_ref: float      # net $ impact at the reference loss (negative)


_TEMPLATES: list[_Template] = [
    _Template("none", "No Action", 0.0, 0.0, 6, -2_400_000),
    _Template("switch", "Switch Supplier", 0.64, 180_000, 3, -620_000),
    _Template("air", "Use Air Freight", 0.41, 95_000, 2, -980_000),
    _Template("inventory", "Increase Safety Stock", 0.37, 140_000, 5, -1_100_000),
]


def _money(value: float) -> str:
    v = abs(value)
    sign = "-" if value < 0 else ""
    if v >= 1_000_000:
        return f"{sign}${v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"{sign}${v / 1_000:.0f}K"
    return f"{sign}${v:.0f}"


class ScenarioService:
    def simulate(self, risk: Risk) -> list[dict]:
        scale = (risk.revenue_at_risk or _REFERENCE_LOSS) / _REFERENCE_LOSS
        out: list[dict] = []
        for t in _TEMPLATES:
            out.append(
                {
                    "id": t.id,
                    "name": t.name,
                    "risk_reduction": f"{int(t.reduction * 100)}%",
                    "cost": _money(t.cost_ref * scale) if t.cost_ref else "$0",
                    "recovery": f"{t.recovery_weeks} weeks",
                    "financial": _money(t.financial_ref * scale),
                }
            )
        return out

    def get(self, risk: Risk, scenario_id: str) -> dict | None:
        return next((s for s in self.simulate(risk) if s["id"] == scenario_id), None)
