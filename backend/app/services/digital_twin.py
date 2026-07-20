"""Digital Twin service.

Builds an in-memory graph from the persisted nodes/edges and supports cascade
traversal: given a disrupted node (e.g. a supplier hit by an earthquake), walk
the dependency edges to the products, factories, customers and revenue it feeds
— the "Taiwan Earthquake → Supplier → Wafer → Processor → Factory → Orders →
Revenue" chain from the spec.
"""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field

from app.models.entities import Edge, Node
from app.repositories import TwinRepository


@dataclass
class TwinGraph:
    nodes: dict[str, Node]
    out_edges: dict[str, list[Edge]] = field(default_factory=lambda: defaultdict(list))
    in_edges: dict[str, list[Edge]] = field(default_factory=lambda: defaultdict(list))

    def neighbors(self, key: str) -> list[str]:
        return [e.target_key for e in self.out_edges.get(key, [])]

    def cascade(self, start_key: str, max_depth: int = 6) -> list[str]:
        """Breadth-first cascade of node keys reachable from ``start_key``."""
        if start_key not in self.nodes:
            return []
        seen: set[str] = {start_key}
        order: list[str] = [start_key]
        queue: deque[tuple[str, int]] = deque([(start_key, 0)])
        while queue:
            key, depth = queue.popleft()
            if depth >= max_depth:
                continue
            for nxt in self.neighbors(key):
                if nxt not in seen:
                    seen.add(nxt)
                    order.append(nxt)
                    queue.append((nxt, depth + 1))
        return order


class DigitalTwinService:
    def __init__(self, twin_repo: TwinRepository) -> None:
        self.twin_repo = twin_repo

    def build_graph(self, company_id: int) -> TwinGraph:
        nodes = {n.key: n for n in self.twin_repo.nodes(company_id)}
        graph = TwinGraph(nodes=nodes)
        for edge in self.twin_repo.edges(company_id):
            graph.out_edges[edge.source_key].append(edge)
            graph.in_edges[edge.target_key].append(edge)
        return graph

    def graph_payload(self, company_id: int) -> dict:
        """Serialise the twin for a React Flow / graph visualisation."""
        nodes = self.twin_repo.nodes(company_id)
        edges = self.twin_repo.edges(company_id)
        return {
            "nodes": [
                {
                    "id": n.key,
                    "type": n.type.value,
                    "label": n.name,
                    "country": n.country,
                    "attributes": n.attributes,
                }
                for n in nodes
            ],
            "edges": [
                {
                    "id": e.id,
                    "source": e.source_key,
                    "target": e.target_key,
                    "type": e.type.value,
                }
                for e in edges
            ],
        }
