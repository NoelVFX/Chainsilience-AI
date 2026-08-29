"""Neo4j knowledge-graph store (optional, additive).

Mirrors each company's Digital Twin — its supply-chain entities and their typed
relationships — into **Neo4j**, and answers supply-chain **dependency-path**
queries in Cypher (every downstream component / product / factory / customer
reachable from a disrupted supplier, i.e. the real impact path).

The relational twin (``twin_nodes`` / ``twin_edges``) stays the source of truth;
this is a graph layer that activates only when ``NEO4J_URI`` is configured and
otherwise degrades to a no-op, so the app runs unchanged without it.

Modelling:
  (:TwinNode:{Type} {company_id, key, name, type, country})
  (a)-[:SUPPLIES|REQUIRES|PRODUCES|DELIVERS|SHIPS|STORES]->(b)
Everything is scoped by ``company_id`` so one company's graph never touches
another's.
"""
from __future__ import annotations

import re

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _label(node_type: str) -> str:
    """A safe PascalCase Cypher label from a node type (e.g. 'supplier' -> Supplier)."""
    parts = re.sub(r"[^a-z0-9_]", "", (node_type or "").lower()).split("_")
    return "".join(p.capitalize() for p in parts if p) or "Node"


def _rel(edge_type: str) -> str:
    """A safe UPPER_SNAKE Cypher relationship type (e.g. 'supplies' -> SUPPLIES)."""
    return re.sub(r"[^A-Z0-9_]", "_", (edge_type or "").upper()) or "RELATED"


def _depth(max_depth: int) -> int:
    """Clamp the traversal depth — it is inlined into Cypher, so keep it bounded."""
    try:
        return max(1, min(12, int(max_depth)))
    except (TypeError, ValueError):
        return 6


class Neo4jGraphStore:
    def __init__(self) -> None:
        self._driver = None
        self._available: bool | None = None

    # --- availability / connection -----------------------------------------
    def configured(self) -> bool:
        return bool(settings.neo4j_uri and settings.neo4j_password)

    def _get_driver(self):
        if self._driver is None:
            from neo4j import GraphDatabase

            self._driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_user, settings.neo4j_password),
            )
        return self._driver

    def available(self) -> bool:
        if self._available is not None:
            return self._available
        if not self.configured():
            self._available = False
            return False
        try:
            self._get_driver().verify_connectivity()
            self._available = True
            logger.info("Neo4j knowledge graph connected (%s).", settings.neo4j_uri)
        except Exception as exc:  # noqa: BLE001
            logger.info("Neo4j unavailable (%s) — graph layer disabled.", exc)
            self._available = False
            return self._available
        # Best-effort: a composite index speeds up the (company_id, key) MERGEs.
        # Never let this flip availability — a composite *uniqueness constraint*
        # is Enterprise-only, so we use a plain index, which Community supports,
        # and swallow any error so an older/edition-limited server still works.
        self._ensure_index()
        return self._available

    def _ensure_index(self) -> None:
        try:
            with self._get_driver().session(database=settings.neo4j_database) as s:
                s.run(
                    "CREATE INDEX twin_node_key IF NOT EXISTS "
                    "FOR (n:TwinNode) ON (n.company_id, n.key)"
                )
        except Exception as exc:  # noqa: BLE001
            logger.info("Neo4j index setup skipped (%s).", exc)

    # --- sync ---------------------------------------------------------------
    def sync_company(self, company_id: int, nodes, edges) -> bool:
        """Replace a company's subgraph with its current nodes + edges (idempotent)."""
        if not self.available():
            return False
        try:
            with self._get_driver().session(database=settings.neo4j_database) as s:
                s.execute_write(self._sync_tx, company_id, list(nodes), list(edges))
            logger.info(
                "Neo4j: synced company %s (%d nodes, %d edges).",
                company_id, len(nodes), len(edges),
            )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Neo4j sync failed for company %s: %s", company_id, exc)
            return False

    @staticmethod
    def _sync_tx(tx, company_id: int, nodes, edges) -> None:
        # Wipe then rebuild this company's subgraph so it stays in lockstep with SQL.
        tx.run("MATCH (n:TwinNode {company_id:$cid}) DETACH DELETE n", cid=company_id)
        for n in nodes:
            tx.run(
                "MERGE (x:TwinNode {company_id:$cid, key:$key}) "
                "SET x.name=$name, x.type=$type, x.country=$country",
                cid=company_id, key=n.key, name=n.name,
                type=n.type.value, country=n.country or "",
            )
            # secondary label = entity type (nicer Cypher / Neo4j Browser)
            tx.run(
                f"MATCH (x:TwinNode {{company_id:$cid, key:$key}}) SET x:{_label(n.type.value)}",
                cid=company_id, key=n.key,
            )
        for e in edges:
            tx.run(
                "MATCH (a:TwinNode {company_id:$cid, key:$src}) "
                "MATCH (b:TwinNode {company_id:$cid, key:$dst}) "
                f"MERGE (a)-[:{_rel(e.type.value)}]->(b)",
                cid=company_id, src=e.source_key, dst=e.target_key,
            )

    def clear_company(self, company_id: int) -> None:
        if not self.available():
            return
        try:
            with self._get_driver().session(database=settings.neo4j_database) as s:
                s.run("MATCH (n:TwinNode {company_id:$cid}) DETACH DELETE n", cid=company_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Neo4j clear failed for company %s: %s", company_id, exc)

    # --- dependency-path queries -------------------------------------------
    def dependency_paths(self, company_id: int, start_key: str, max_depth: int = 6) -> list[dict]:
        """Downstream dependency paths from a node to its sinks (customers / leaves).

        This is the supply-chain path mapping: e.g. Supplier → Component → Product
        → Factory → Customer, computed by the graph database in Cypher.
        """
        if not self.available():
            return []
        d = _depth(max_depth)
        cypher = (
            f"MATCH p = (s:TwinNode {{company_id:$cid, key:$key}})-[*1..{d}]->(t:TwinNode) "
            "WHERE t:Customer OR NOT (t)-->() "
            "RETURN [x IN nodes(p) | {key:x.key, name:x.name, type:x.type}] AS nodes, "
            "       [r IN relationships(p) | type(r)] AS rels "
            "ORDER BY length(p) DESC LIMIT 25"
        )
        try:
            with self._get_driver().session(database=settings.neo4j_database) as s:
                recs = s.run(cypher, cid=company_id, key=start_key)
                return [{"nodes": r["nodes"], "relationships": r["rels"]} for r in recs]
        except Exception as exc:  # noqa: BLE001
            logger.warning("Neo4j dependency_paths failed: %s", exc)
            return []

    def impacted(self, company_id: int, start_key: str, max_depth: int = 6) -> list[dict]:
        """Every node reachable downstream from a disrupted node (impact radius)."""
        if not self.available():
            return []
        d = _depth(max_depth)
        cypher = (
            f"MATCH (s:TwinNode {{company_id:$cid, key:$key}})-[*1..{d}]->(x:TwinNode) "
            "RETURN DISTINCT x.key AS key, x.name AS name, x.type AS type"
        )
        try:
            with self._get_driver().session(database=settings.neo4j_database) as s:
                recs = s.run(cypher, cid=company_id, key=start_key)
                return [{"key": r["key"], "name": r["name"], "type": r["type"]} for r in recs]
        except Exception as exc:  # noqa: BLE001
            logger.warning("Neo4j impacted failed: %s", exc)
            return []

    def graph_payload(self, company_id: int) -> dict | None:
        """Read the company's graph back from Neo4j for visualisation."""
        if not self.available():
            return None
        try:
            with self._get_driver().session(database=settings.neo4j_database) as s:
                nrecs = s.run(
                    "MATCH (n:TwinNode {company_id:$cid}) "
                    "RETURN n.key AS id, n.type AS type, n.name AS label, n.country AS country",
                    cid=company_id,
                )
                nodes = [
                    {"id": r["id"], "type": r["type"], "label": r["label"], "country": r["country"]}
                    for r in nrecs
                ]
                erecs = s.run(
                    "MATCH (a:TwinNode {company_id:$cid})-[r]->(b:TwinNode {company_id:$cid}) "
                    "RETURN a.key AS source, b.key AS target, type(r) AS type",
                    cid=company_id,
                )
                edges = [
                    {"source": r["source"], "target": r["target"], "type": r["type"]}
                    for r in erecs
                ]
            return {"nodes": nodes, "edges": edges}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Neo4j graph_payload failed: %s", exc)
            return None

    def close(self) -> None:
        if self._driver is not None:
            try:
                self._driver.close()
            finally:
                self._driver = None


# Module-level singleton.
graph_store = Neo4jGraphStore()


def get_graph_store() -> Neo4jGraphStore:
    return graph_store
