"""Digital Twin bootstrapper.

Turns a new company's onboarding profile (industry, countries, primary products)
into a coherent, connected Digital Twin — suppliers, components, products, a
factory and customers with realistic attributes and edges — so a brand-new SME
lands on a **populated, working** dashboard instead of an empty one.

Also auto-wires edges for uploaded CSVs, and seeds a couple of starter risks by
running the real intelligence pipeline against region-relevant sample headlines.
"""
from __future__ import annotations

from app.core.logging import get_logger
from app.models.entities import (
    Company,
    Edge,
    EdgeType,
    NewsItem,
    Node,
    NodeType,
)
from app.models.entities import _utcnow
from app.repositories import NewsRepository, TwinRepository

logger = get_logger(__name__)


def _split(csv_text: str, limit: int = 3) -> list[str]:
    parts = [p.strip() for p in (csv_text or "").replace(";", ",").split(",")]
    return [p for p in parts if p][:limit]


def _slug(text: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in text.lower()).strip("_") or "x"


class TwinBuilder:
    def __init__(self, session) -> None:
        self.session = session
        self.twin = TwinRepository(session)

    # ---- profile bootstrap --------------------------------------------------
    def bootstrap_from_profile(self, company: Company) -> int:
        """Create a starter twin from the company profile. No-op if one exists."""
        if self.twin.nodes(company.id):
            return 0

        countries = _split(company.countries) or ["Global"]
        products = _split(company.primary_products, limit=3) or ["Flagship Product"]

        nodes: list[Node] = []
        edges: list[Edge] = []

        # One primary supplier per country of operation.
        supplier_keys: list[str] = []
        for i, country in enumerate(countries):
            key = f"sup_{_slug(country)}"
            supplier_keys.append(key)
            nodes.append(Node(
                company_id=company.id, key=key, type=NodeType.SUPPLIER,
                name=f"{country} Primary Supplier", location=country, country=country,
                attributes={
                    "lead_time_days": 30 + i * 10,
                    "reliability": 0.9 - i * 0.05,
                    "risk": 0.4 + i * 0.1,
                    # First country is the most depended-on.
                    "dependency_share": round(0.6 - i * 0.15, 2),
                    "alt_suppliers": i,
                    "cost_index": 1.0 + i * 0.1,
                },
            ))

        # A factory and a customer node (shared across products).
        factory_key = "fac_primary"
        nodes.append(Node(
            company_id=company.id, key=factory_key, type=NodeType.FACTORY,
            name="Primary Assembly Plant", location=countries[0], country=countries[0],
            attributes={"capacity_units": 50000, "utilization": 0.8},
        ))
        customer_key = "cus_orders"
        nodes.append(Node(
            company_id=company.id, key=customer_key, type=NodeType.CUSTOMER,
            name="Customer Orders", location="Global", country="Global",
            attributes={"open_orders_units": 900, "priority": "high"},
        ))

        # Each product gets a component; suppliers feed components.
        for j, product in enumerate(products):
            pkey = f"prd_{_slug(product)}"
            ckey = f"cmp_{_slug(product)}"
            nodes.append(Node(
                company_id=company.id, key=pkey, type=NodeType.PRODUCT,
                name=product, location=countries[0], country=countries[0],
                attributes={"margin": 0.4, "monthly_revenue": 2_000_000 - j * 400_000,
                            "safety_stock_days": 18},
            ))
            nodes.append(Node(
                company_id=company.id, key=ckey, type=NodeType.COMPONENT,
                name=f"{product} Key Component", location=countries[0], country=countries[0],
                attributes={"inventory": 40000, "safety_stock": 18000, "coverage_days": 16 + j * 4},
            ))
            edges.append(Edge(company_id=company.id, source_key=pkey, target_key=ckey, type=EdgeType.REQUIRES))
            edges.append(Edge(company_id=company.id, source_key=factory_key, target_key=pkey, type=EdgeType.PRODUCES))
            # every supplier supplies this component
            for skey in supplier_keys:
                edges.append(Edge(company_id=company.id, source_key=skey, target_key=ckey, type=EdgeType.SUPPLIES))
        edges.append(Edge(company_id=company.id, source_key=factory_key, target_key=customer_key, type=EdgeType.DELIVERS))

        self.session.add_all(nodes)
        self.session.add_all(edges)
        self.session.commit()
        logger.info("Bootstrapped twin for company %s: %d nodes, %d edges.",
                    company.id, len(nodes), len(edges))
        return len(nodes)

    # ---- CSV edge auto-wiring ------------------------------------------------
    def autowire_edges(self, company_id: int) -> int:
        """Connect an uploaded node set by type convention (idempotent-ish).

        supplier→component (SUPPLIES), product→component (REQUIRES),
        factory→product (PRODUCES), factory→customer (DELIVERS).
        """
        nodes = self.twin.nodes(company_id)
        if not nodes:
            return 0
        existing = {(e.source_key, e.target_key) for e in self.twin.edges(company_id)}
        by_type: dict[NodeType, list[Node]] = {}
        for n in nodes:
            by_type.setdefault(n.type, []).append(n)

        def link(src_list, dst_list, etype):
            made = 0
            for s in src_list:
                for d in dst_list:
                    if (s.key, d.key) in existing:
                        continue
                    self.twin.add_edge(Edge(company_id=company_id, source_key=s.key,
                                            target_key=d.key, type=etype))
                    existing.add((s.key, d.key))
                    made += 1
            return made

        components = by_type.get(NodeType.COMPONENT, [])
        products = by_type.get(NodeType.PRODUCT, [])
        factories = by_type.get(NodeType.FACTORY, [])
        customers = by_type.get(NodeType.CUSTOMER, [])
        made = 0
        made += link(by_type.get(NodeType.SUPPLIER, []), components or products, EdgeType.SUPPLIES)
        made += link(products, components, EdgeType.REQUIRES)
        made += link(factories, products, EdgeType.PRODUCES)
        made += link(factories, customers, EdgeType.DELIVERS)
        return made

    # ---- starter risks ------------------------------------------------------
    def seed_starter_risks(self, company: Company) -> list[int]:
        """Run the real pipeline on region-relevant headlines to populate risks."""
        # Local import avoids a circular dependency (pipeline imports services).
        from app.services.pipeline import IntelligencePipeline

        countries = _split(company.countries) or ["Global"]
        c0 = countries[0]
        headlines = [
            (f"Port congestion worsens at major {c0} terminals amid export surge",
             "Backlogs are delaying container departures across the region."),
            (f"New export tariffs announced affecting {c0} manufacturers",
             "Trade groups warn of higher input costs and supply delays."),
        ]
        if len(countries) > 1:
            headlines.append((
                f"Severe weather disrupts logistics routes through {countries[1]}",
                "Shipping and trucking operators report multi-day delays.",
            ))

        news_repo = NewsRepository(self.session)
        pipeline = IntelligencePipeline(self.session)
        risk_ids: list[int] = []
        for source_title, body in headlines:
            item = news_repo.add(NewsItem(source="ChainSight Feed", title=source_title,
                                          body=body, published_at=_utcnow()))
            result = pipeline.process(company.id, item)
            if result.risk:
                risk_ids.append(result.risk.id)
        logger.info("Seeded %d starter risk(s) for company %s.", len(risk_ids), company.id)
        return risk_ids
