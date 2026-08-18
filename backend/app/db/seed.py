"""Idempotent demo seed.

Populates a complete, coherent scenario (the "Taiwan earthquake → wafer supply"
story from the design handoff) so the end-to-end workflow — dashboard, risk
detail, scenario simulator, action center — is demonstrable the moment the app
boots, with no manual data entry. Safe to call on every startup: it no-ops if a
demo company already exists.
"""
from __future__ import annotations

from datetime import timedelta

from sqlmodel import Session, select

from app.core.logging import get_logger
from app.core.security import hash_password
from app.models.entities import (
    Action,
    ActionStatus,
    Company,
    Edge,
    EdgeType,
    Event,
    NewsItem,
    Node,
    NodeType,
    Risk,
    Severity,
    User,
    UserRole,
)
from app.models.entities import _utcnow

logger = get_logger(__name__)

DEMO_EMAIL = "demo@chainsight.ai"
DEMO_PASSWORD = "demo1234"


def _ago(**kwargs) -> "datetime":  # type: ignore[name-defined]
    return _utcnow() - timedelta(**kwargs)


def seed_if_empty(session: Session) -> None:
    """Seed the demo dataset unless it already exists."""
    existing = session.exec(select(Company).where(Company.name == "Acme Semiconductor Inc.")).first()
    if existing:
        logger.info("Seed skipped — demo company already present.")
        return

    logger.info("Seeding demo dataset …")

    # --- Company + user ------------------------------------------------------
    company = Company(
        name="Acme Semiconductor Inc.",
        industry="Semiconductors",
        countries="Taiwan, USA, Vietnam",
        risk_tolerance="Balanced",
        primary_products="Processor X200, Sensor Array M4",
        data_quality_score=92,
        # The public demo account is always entitled (never gated by billing).
        plan="growth",
        plan_active=True,
    )
    session.add(company)
    session.commit()
    session.refresh(company)

    session.add(
        User(
            email=DEMO_EMAIL,
            full_name="Demo Manager",
            hashed_password=hash_password(DEMO_PASSWORD),
            role=UserRole.MANAGER,
            company_id=company.id,
        )
    )

    # --- Digital Twin --------------------------------------------------------
    _seed_twin(session, company.id)

    # --- News + events + risks ----------------------------------------------
    primary_risk = _seed_intelligence(session, company.id)

    # --- Action center -------------------------------------------------------
    _seed_actions(session, company.id, primary_risk.id)

    session.commit()
    logger.info("Seed complete (company_id=%s).", company.id)


def _seed_twin(session: Session, company_id: int) -> None:
    nodes = [
        Node(company_id=company_id, key="sup_tsmc_partner", type=NodeType.SUPPLIER,
             name="TSMC Partner Fab", location="Hsinchu", country="Taiwan",
             attributes={"lead_time_days": 45, "reliability": 0.94, "risk": 0.7,
                         "dependency_share": 0.68, "alt_suppliers": 0, "cost_index": 1.0}),
        Node(company_id=company_id, key="sup_northern", type=NodeType.SUPPLIER,
             name="Northern Materials Co.", location="Osaka", country="Japan",
             attributes={"lead_time_days": 30, "reliability": 0.9, "risk": 0.4,
                         "dependency_share": 0.35, "alt_suppliers": 2, "cost_index": 1.1}),
        Node(company_id=company_id, key="cmp_silicon_wafer", type=NodeType.COMPONENT,
             name="Silicon Wafer", location="Hsinchu", country="Taiwan",
             attributes={"inventory": 42000, "safety_stock": 20000, "coverage_days": 14}),
        Node(company_id=company_id, key="cmp_rare_earth", type=NodeType.COMPONENT,
             name="Neodymium Magnet", location="Osaka", country="Japan",
             attributes={"inventory": 88000, "safety_stock": 40000, "coverage_days": 28}),
        Node(company_id=company_id, key="prd_processor_x200", type=NodeType.PRODUCT,
             name="Processor X200", location="Austin", country="USA",
             attributes={"margin": 0.42, "monthly_revenue": 4_000_000, "safety_stock_days": 14}),
        Node(company_id=company_id, key="prd_sensor_m4", type=NodeType.PRODUCT,
             name="Sensor Array M4", location="Austin", country="USA",
             attributes={"margin": 0.38, "monthly_revenue": 1_600_000, "safety_stock_days": 21}),
        Node(company_id=company_id, key="fac_austin", type=NodeType.FACTORY,
             name="Austin Assembly", location="Austin", country="USA",
             attributes={"capacity_units": 60000, "utilization": 0.82}),
        Node(company_id=company_id, key="cus_enterprise", type=NodeType.CUSTOMER,
             name="Enterprise Orders", location="Global", country="Global",
             attributes={"open_orders_units": 1240, "priority": "high"}),
        Node(company_id=company_id, key="prt_kaohsiung", type=NodeType.PORT,
             name="Kaohsiung Port", location="Kaohsiung", country="Taiwan",
             attributes={"congestion": 0.6}),
    ]
    session.add_all(nodes)

    edges = [
        Edge(company_id=company_id, source_key="sup_tsmc_partner", target_key="cmp_silicon_wafer", type=EdgeType.SUPPLIES),
        Edge(company_id=company_id, source_key="sup_northern", target_key="cmp_rare_earth", type=EdgeType.SUPPLIES),
        Edge(company_id=company_id, source_key="prd_processor_x200", target_key="cmp_silicon_wafer", type=EdgeType.REQUIRES),
        Edge(company_id=company_id, source_key="prd_sensor_m4", target_key="cmp_rare_earth", type=EdgeType.REQUIRES),
        Edge(company_id=company_id, source_key="fac_austin", target_key="prd_processor_x200", type=EdgeType.PRODUCES),
        Edge(company_id=company_id, source_key="fac_austin", target_key="prd_sensor_m4", type=EdgeType.PRODUCES),
        Edge(company_id=company_id, source_key="cmp_silicon_wafer", target_key="prt_kaohsiung", type=EdgeType.SHIPS),
        Edge(company_id=company_id, source_key="fac_austin", target_key="cus_enterprise", type=EdgeType.DELIVERS),
    ]
    session.add_all(edges)
    session.commit()


def _seed_intelligence(session: Session, company_id: int) -> Risk:
    """Seed news, extracted events, and matched+scored risks. Returns the headline risk."""
    # (news, event, risk) tuples authored to reproduce the prototype's data.
    specs = [
        dict(
            source="Reuters",
            headline="7.2 magnitude earthquake strikes Taiwan, chip fabs pause production",
            published=_ago(hours=2), etype="earthquake", country="Taiwan",
            title="Taiwan Earthquake — Silicon Wafer Supply",
            risk_headline="Taiwan Earthquake — Silicon Wafer Supply Disruption",
            supplier="TSMC Partner Fab", severity=Severity.CRITICAL, score=92,
            confidence=0.9, revenue=2_400_000, primary=True,
            reasoning=(
                "A 7.2 magnitude earthquake struck Hsinchu, Taiwan, halting operations at "
                "your primary wafer supplier. This supplier accounts for 68% of Processor "
                "X200 wafer volume with no qualified alternate on file, and current safety "
                "stock covers only 14 days of production — driving a high composite risk score."
            ),
            factors=[
                {"label": "Event Severity", "value": 88},
                {"label": "Supplier Dependency", "value": 81},
                {"label": "Inventory Coverage", "value": 34},
                {"label": "Alternative Suppliers", "value": 22},
                {"label": "Geographic Exposure", "value": 76},
            ],
            impact=[
                {"label": "Inventory Coverage", "value": "14 days"},
                {"label": "Production Delay", "value": "9–12 days"},
                {"label": "Revenue at Risk", "value": "$2.4M"},
                {"label": "Affected Products", "value": "3"},
                {"label": "Affected Customers", "value": "18"},
                {"label": "Recovery Time", "value": "6 weeks"},
            ],
            chain=[
                "Taiwan Earthquake (M7.2)", "Supplier: TSMC Partner Fab",
                "Component: Silicon Wafer", "Product: Processor X200",
                "Factory: Austin Assembly", "Customer Orders: 1,240 units",
                "Revenue Risk: $2.4M",
            ],
        ),
        dict(source="Bloomberg", headline="Red Sea shipping delays push freight rates up 18%",
             published=_ago(hours=5), etype="port_congestion", country="Egypt",
             title="Suez Canal Congestion", risk_headline="Suez Canal Congestion — Freight Delays",
             supplier="MedGlobal Logistics", severity=Severity.HIGH, score=74,
             confidence=0.82, revenue=680_000),
        dict(source="WSJ", headline="US tightens export controls on advanced semiconductor equipment",
             published=_ago(hours=9), etype="export_restriction", country="USA",
             title="US Export Restriction — Rare Earths",
             risk_headline="US Export Restriction — Rare Earth Materials",
             supplier="Northern Materials Co.", severity=Severity.MEDIUM, score=58,
             confidence=0.71, revenue=210_000),
        dict(source="gCaptain", headline="Rotterdam dockworkers announce 48-hour strike",
             published=_ago(days=2), etype="strike", country="Netherlands",
             title="Port Strike — Rotterdam", risk_headline="Port Strike — Rotterdam Terminal",
             supplier="EuroFreight NV", severity=Severity.LOW, score=33,
             confidence=0.68, revenue=40_000),
        # secondary disruptions (feed the KPI counters)
        # Secondary disruptions carry small exposure (they feed the KPI counters
        # without inflating the headline "Revenue at Risk", which is dominated by
        # the four top risks above ≈ $3.3M).
        dict(source="Nikkei", headline="Factory fire disrupts sensor component output in Vietnam",
             published=_ago(hours=3), etype="factory_fire", country="Vietnam",
             title="Vietnam Factory Fire — Sensor Components", supplier="Delta Components",
             severity=Severity.CRITICAL, score=86, confidence=0.8, revenue=42_000),
        dict(source="Lloyd's List", headline="Malacca Strait congestion delays electronics shipments",
             published=_ago(hours=8), etype="port_congestion", country="Malaysia",
             title="Malacca Strait Shipping Delay", supplier="OceanLink",
             severity=Severity.CRITICAL, score=83, confidence=0.77, revenue=24_000),
        dict(source="Mining.com", headline="Neodymium prices spike 22% on supply concerns",
             published=_ago(hours=12), etype="commodity_price", country="China",
             title="Rare Earth Price Spike — Neodymium", supplier="Northern Materials Co.",
             severity=Severity.CRITICAL, score=81, confidence=0.74, revenue=15_000),
        dict(source="SCMP", headline="Shenzhen port congestion builds amid export surge",
             published=_ago(hours=14), etype="port_congestion", country="China",
             title="Shenzhen Port Congestion", supplier="PacRim Freight",
             severity=Severity.HIGH, score=70, confidence=0.72, revenue=9_000),
        dict(source="Reuters", headline="Typhoon warning issued for South China Sea shipping lanes",
             published=_ago(days=1), etype="weather", country="Philippines",
             title="Typhoon Warning — South China Sea", supplier="OceanLink",
             severity=Severity.HIGH, score=67, confidence=0.7, revenue=6_000),
        dict(source="TechCrunch", headline="Cyberattack disrupts European logistics provider",
             published=_ago(days=1), etype="cyberattack", country="Germany",
             title="Cyberattack — Logistics Provider", supplier="EuroFreight NV",
             severity=Severity.MEDIUM, score=54, confidence=0.66, revenue=4_000),
        dict(source="OilPrice", headline="Bunker fuel surcharge increases across Asia-Europe routes",
             published=_ago(days=2), etype="fuel_price", country="Global",
             title="Fuel Surcharge Increase", supplier="Global Carriers",
             severity=Severity.LOW, score=29, confidence=0.64, revenue=2_000),
    ]

    primary_risk: Risk | None = None
    for s in specs:
        news = NewsItem(source=s["source"], title=s["headline"], published_at=s["published"])
        session.add(news)
        session.commit()
        session.refresh(news)

        event = Event(
            news_id=news.id, type=s["etype"], country=s["country"], location=s["country"],
            severity=s["severity"], confidence=s["confidence"], summary=s["headline"],
            created_at=s["published"],
        )
        session.add(event)
        session.commit()
        session.refresh(event)

        risk = Risk(
            company_id=company_id, event_id=event.id, title=s["title"],
            headline=s.get("risk_headline", s["title"]), supplier=s["supplier"],
            severity=s["severity"], score=s["score"], confidence=s["confidence"],
            revenue_at_risk=s["revenue"], reasoning=s.get("reasoning", ""),
            factors=s.get("factors", []), impact=s.get("impact", []),
            chain=s.get("chain", []), created_at=s["published"],
        )
        session.add(risk)
        session.commit()
        session.refresh(risk)
        if s.get("primary"):
            primary_risk = risk

    assert primary_risk is not None
    return primary_risk


def _seed_actions(session: Session, company_id: int, risk_id: int) -> None:
    actions = [
        Action(company_id=company_id, risk_id=risk_id, title="Switch to alternate wafer supplier",
                owner="Procurement", deadline="Jul 22", priority=Severity.HIGH,
                status=ActionStatus.RECOMMENDED, department="Procurement",
                estimated_benefit="64% risk reduction", estimated_cost="$180K"),
        Action(company_id=company_id, risk_id=risk_id, title="Increase safety stock — Processor X200",
                owner="Ops", deadline="Jul 25", priority=Severity.MEDIUM,
                status=ActionStatus.APPROVED, department="Operations",
                estimated_benefit="37% risk reduction", estimated_cost="$140K"),
        Action(company_id=company_id, risk_id=risk_id, title="Draft customer notification email",
                owner="A. Chen", deadline="Jul 20", priority=Severity.HIGH,
                status=ActionStatus.ASSIGNED, department="Customer Success"),
        Action(company_id=company_id, risk_id=risk_id, title="Air freight rerouting — Factory B",
                owner="Logistics", deadline="Jul 21", priority=Severity.CRITICAL,
                status=ActionStatus.IN_PROGRESS, department="Logistics",
                estimated_benefit="41% risk reduction", estimated_cost="$95K"),
        Action(company_id=company_id, risk_id=risk_id, title="Data quality audit Q2",
                owner="Analyst Team", deadline="Jul 15", priority=Severity.LOW,
                status=ActionStatus.COMPLETED, department="Analytics"),
    ]
    session.add_all(actions)
    session.commit()
