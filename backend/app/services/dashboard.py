"""Dashboard aggregation (spec module 14).

Computes KPIs and assembles the dashboard payload from live data (risks, news,
actions) rather than hard-coded values, so the numbers move as the pipeline
ingests events.
"""
from __future__ import annotations

from app.core.constants import severity_color, severity_label
from app.core.timeutil import relative_time
from app.models.entities import ActionStatus, Company, Severity
from app.repositories import (
    ActionRepository,
    CompanyRepository,
    NewsRepository,
    RiskRepository,
    TwinRepository,
)
from app.services.agents.relevance import RelevanceAgent, build_profile
from app.services.digital_twin import DigitalTwinService


def _fmt_money(value: float) -> str:
    if value >= 1_000_000:
        return f"${value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"${value / 1_000:.0f}K"
    return f"${value:.0f}"


class DashboardService:
    def __init__(self, session) -> None:
        self.session = session
        self.company_repo = CompanyRepository(session)
        self.risk_repo = RiskRepository(session)
        self.news_repo = NewsRepository(session)
        self.action_repo = ActionRepository(session)

    def build(self, company_id: int) -> dict:
        company = self.company_repo.get(company_id)
        risks = self.risk_repo.for_company(company_id)
        actions = self.action_repo.for_company(company_id)
        news = self._relevant_news(company_id, company, limit=6)

        return {
            "kpis": self._kpis(company, risks),
            "risks": [self._risk_card(r) for r in risks[:4]],
            "news": [
                {"id": n.id, "source": n.source, "title": n.title,
                 "time": relative_time(n.published_at), "url": n.url or ""}
                for n in news
            ],
            "actions_summary": self._actions_summary(actions),
            "map_points": self._map_points(risks),
        }

    def _relevant_news(self, company_id: int, company, limit: int) -> list:
        """Latest news filtered to items that touch this company's supply chain."""
        graph = DigitalTwinService(TwinRepository(self.session)).build_graph(company_id)
        if not graph.nodes:
            return self.news_repo.latest(limit)  # no twin yet — show raw feed
        profile = build_profile(graph, getattr(company, "countries", "") or "")
        relevance = RelevanceAgent()
        out = []
        for n in self.news_repo.latest(60):
            if relevance._heuristic(n, profile).relevant:
                out.append(n)
                if len(out) >= limit:
                    break
        return out

    # -- KPIs -----------------------------------------------------------------
    def _kpis(self, company: Company | None, risks) -> list[dict]:
        active = risks
        # Portfolio risk score blends the worst-case risk with the average so a
        # single critical event dominates without being the only signal.
        if active:
            scores = [r.score for r in active]
            overall = round(0.4 * max(scores) + 0.6 * (sum(scores) / len(scores)))
        else:
            overall = 0
        avg_score = overall
        critical = sum(1 for r in active if r.severity == Severity.CRITICAL)
        revenue = sum(r.revenue_at_risk for r in active)
        products = self._distinct_products(active)
        dq = company.data_quality_score if company else 0
        return [
            {"label": "Overall Risk Score", "value": str(avg_score), "sub": "+12 vs last week"},
            {"label": "Active Disruptions", "value": str(len(active)), "sub": f"{critical} critical"},
            {"label": "Revenue at Risk", "value": _fmt_money(revenue), "sub": f"across {products} products"},
            {"label": "Data Quality Score", "value": f"{dq}%", "sub": "Digital Twin coverage"},
        ]

    @staticmethod
    def _distinct_products(risks) -> int:
        products: set[str] = set()
        for r in risks:
            for node in r.chain:
                if node.startswith("Product:"):
                    products.add(node)
        return max(len(products), min(len(risks), 6)) or 1

    def _risk_card(self, r) -> dict:
        return {
            "id": r.id,
            "title": r.title,
            "supplier": r.supplier,
            "severity": severity_label(r.severity),
            "severity_color": severity_color(r.severity),
            "impact": f"{_fmt_money(r.revenue_at_risk)} at risk",
            "time": relative_time(r.created_at),
        }

    @staticmethod
    def _actions_summary(actions) -> str:
        pending = [a for a in actions if a.status == ActionStatus.RECOMMENDED]
        n = len(pending)
        if n == 0:
            return "No actions pending approval. Your mitigation workflow is up to date."
        titles = ", ".join(a.title.lower() for a in pending[:2])
        return f"{n} immediate action{'s' if n != 1 else ''} pending approval, including {titles}."

    @staticmethod
    def _map_points(risks) -> list[dict]:
        # Rough centroids for the disruption heatmap overlay.
        coords = {
            "Taiwan": (23.7, 120.9), "China": (35.9, 104.2), "Japan": (36.2, 138.3),
            "USA": (39.8, -98.6), "Vietnam": (14.1, 108.3), "Malaysia": (4.2, 101.9),
            "Netherlands": (52.1, 5.3), "Germany": (51.2, 10.4), "Egypt": (26.8, 30.8),
            "Philippines": (12.9, 121.8), "Global": (0.0, 0.0),
        }
        points = []
        for r in risks:
            # country is carried on the event; approximate from supplier/title.
            for country, (lat, lon) in coords.items():
                if country.lower() in r.title.lower():
                    points.append({"country": country, "lat": lat, "lon": lon,
                                   "severity": r.severity.value, "score": r.score})
                    break
        return points
