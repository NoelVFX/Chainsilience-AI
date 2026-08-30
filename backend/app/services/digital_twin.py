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

    # ---- Neo4j knowledge-graph sync -----------------------------------------
    def sync_to_graph_store(self, company_id: int) -> bool:
        """Mirror this company's twin into Neo4j (no-op when Neo4j isn't configured)."""
        from app.services.graph_store import get_graph_store

        nodes = self.twin_repo.nodes(company_id)
        edges = self.twin_repo.edges(company_id)
        return get_graph_store().sync_company(company_id, nodes, edges)

    def dependency_paths(self, company_id: int, start_key: str, max_depth: int = 6) -> dict:
        """Supply-chain dependency paths downstream of ``start_key``.

        Prefers the Neo4j graph database (Cypher variable-length path mapping);
        transparently falls back to in-memory graph traversal when Neo4j is not
        configured or unavailable, so the endpoint always returns real paths.
        """
        from app.services.graph_store import get_graph_store

        store = get_graph_store()
        if store.available():
            paths = store.dependency_paths(company_id, start_key, max_depth)
            if paths:
                return {"source": "neo4j", "start": start_key, "paths": paths}

        # In-memory fallback: reconstruct downstream simple paths to the sinks.
        graph = self.build_graph(company_id)
        return {
            "source": "in_memory",
            "start": start_key,
            "paths": _reconstruct_paths(graph, start_key, max_depth),
        }


# How a disruption propagates through each edge type. Impact usually flows
# source -> target (a supplier's outage hits the component it SUPPLIES), but the
# stored REQUIRES / PRODUCES edges point the "wrong" way (a product REQUIRES a
# component; a factory PRODUCES a product), so impact flows in reverse there.
# Each entry is (reverse?, readable label for the step in the impact direction).
_IMPACT_EDGE: dict[str, tuple[bool, str]] = {
    "supplies": (False, "supplies"),
    "requires": (True, "required by"),
    "produces": (True, "produced by"),
    "delivers": (False, "delivers to"),
    "ships": (False, "ships to"),
    "stores": (False, "stores"),
}


def _impact_step(edge_type: str) -> tuple[bool, str]:
    """(reverse?, label) for orienting an edge in the downstream-impact direction."""
    return _IMPACT_EDGE.get(edge_type, (False, edge_type))


def _reconstruct_paths(graph: "TwinGraph", start_key: str, max_depth: int) -> list[dict]:
    """DFS every downstream **impact** path from ``start_key`` to a sink node.

    Follows the direction a disruption actually propagates — supplier → component
    → product → factory → customer — by orienting REQUIRES/PRODUCES edges in
    reverse. A sink is a customer or a node with no downstream impact edges.
    Mirrors the Neo4j ``:IMPACTS`` traversal so the fallback returns the same
    chains.
    """
    from app.models.entities import NodeType

    if start_key not in graph.nodes:
        return []

    # Build the impact adjacency (with readable step labels) once.
    impact_adj: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for edge_list in graph.out_edges.values():
        for e in edge_list:
            reverse, label = _impact_step(e.type.value)
            src, dst = (e.target_key, e.source_key) if reverse else (e.source_key, e.target_key)
            impact_adj[src].append((dst, label))

    def describe(key: str) -> dict:
        n = graph.nodes[key]
        return {"key": key, "name": n.name, "type": n.type.value}

    def is_sink(key: str) -> bool:
        node = graph.nodes.get(key)
        return not impact_adj.get(key) or (node is not None and node.type == NodeType.CUSTOMER)

    results: list[dict] = []
    stack: list[tuple[str, list[str], list[str]]] = [(start_key, [start_key], [])]
    while stack and len(results) < 25:
        key, node_path, rel_path = stack.pop()
        if len(node_path) > 1 and is_sink(key):
            results.append({
                "nodes": [describe(k) for k in node_path],
                "relationships": rel_path,
            })
            continue
        if len(node_path) - 1 >= max_depth:
            continue
        for tgt, label in impact_adj.get(key, []):
            if tgt in node_path:  # avoid cycles
                continue
            stack.append((tgt, node_path + [tgt], rel_path + [label]))
    results.sort(key=lambda p: len(p["nodes"]), reverse=True)
    return results
