"""Impact Prediction (spec module 10).

Translates a scored risk into concrete operational impact tiles: inventory
depletion, production delay, revenue loss, affected products/customers and
recovery time. Deterministic and explainable — derived from twin attributes.
"""
from __future__ import annotations

from app.models.entities import Node
from app.services.digital_twin import TwinGraph
from app.services.matching import Match


def _fmt_money(value: float) -> str:
    if value >= 1_000_000:
        return f"${value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"${value / 1_000:.0f}K"
    return f"${value:.0f}"


class ImpactService:
    def predict(self, match: Match, graph: TwinGraph, score: int) -> tuple[list[dict], float]:
        """Return (impact_tiles, revenue_at_risk)."""
        supplier = match.supplier
        coverage = self._coverage_days(match, graph)
        products = self._affected_products(match, graph)

        monthly_revenue = sum(
            float(p.attributes.get("monthly_revenue", 0)) for p in products
        ) or 1_000_000
        dep = float(supplier.attributes.get("dependency_share", 0.4))
        # Revenue at risk scales with dependency and severity of the score.
        revenue_at_risk = monthly_revenue * dep * (score / 100)

        delay_low = max(3, coverage // 2)
        delay_high = delay_low + 3
        recovery_weeks = max(2, round(score / 16))
        customers = sum(
            int(c.attributes.get("open_orders_units", 0)) // 70
            for c in graph.nodes.values()
            if c.type.value == "customer"
        ) or 12

        tiles = [
            {"label": "Inventory Coverage", "value": f"{coverage} days"},
            {"label": "Production Delay", "value": f"{delay_low}–{delay_high} days"},
            {"label": "Revenue at Risk", "value": _fmt_money(revenue_at_risk)},
            {"label": "Affected Products", "value": str(max(1, len(products)))},
            {"label": "Affected Customers", "value": str(customers)},
            {"label": "Recovery Time", "value": f"{recovery_weeks} weeks"},
        ]
        return tiles, revenue_at_risk

    @staticmethod
    def _coverage_days(match: Match, graph: TwinGraph) -> int:
        for key in match.affected_keys:
            node = graph.nodes.get(key)
            if node and node.type.value == "component":
                return int(node.attributes.get("coverage_days", 21))
        return 21

    @staticmethod
    def _affected_products(match: Match, graph: TwinGraph) -> list[Node]:
        return [
            graph.nodes[k]
            for k in match.affected_keys
            if k in graph.nodes and graph.nodes[k].type.value == "product"
        ]
