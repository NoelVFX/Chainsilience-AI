"""Event Matching Engine (spec module 8).

Decides whether an extracted event actually threatens the company by matching it
against the Digital Twin — supplier locations, component/product exposure and
geography. Irrelevant events (wrong region, no dependency) are dropped.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.models.entities import Event, Node, NodeType
from app.services.digital_twin import TwinGraph


@dataclass
class Match:
    supplier: Node
    relevance: float  # 0-1
    affected_keys: list[str]


class MatchingService:
    def match(self, event: Event, graph: TwinGraph) -> Match | None:
        """Return the strongest supplier match for an event, or ``None``."""
        best: Match | None = None
        for node in graph.nodes.values():
            if node.type != NodeType.SUPPLIER:
                continue
            relevance = self._score_supplier(event, node)
            if relevance <= 0:
                continue
            cascade = graph.cascade(node.key)
            candidate = Match(node, relevance, cascade)
            if best is None or relevance > best.relevance:
                best = candidate
        return best

    @staticmethod
    def _score_supplier(event: Event, supplier: Node) -> float:
        relevance = 0.0
        # Geographic overlap is the dominant signal.
        if event.country and supplier.country and event.country == supplier.country:
            relevance += 0.6
        elif event.country and event.country == "Global":
            relevance += 0.2
        # Dependency share weights how much a hit here actually matters.
        relevance += 0.4 * float(supplier.attributes.get("dependency_share", 0.3))
        # Weather/port/fuel events touch logistics broadly.
        if event.type in {"port_congestion", "weather", "fuel_price"}:
            relevance += 0.15
        return min(relevance, 1.0)
