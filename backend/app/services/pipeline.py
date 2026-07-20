"""Intelligence pipeline coordinator.

Orchestrates the end-to-end reasoning chain for a single news item:

    news → extract event → match to twin → score risk → predict impact
         → persist Risk → generate recommended actions

This is the "automated reasoning" the product promises, wired as one method so
the API (and background workers) can trigger it. It composes the specialised
services rather than duplicating their logic (Single Responsibility).
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.constants import severity_label
from app.core.logging import get_logger
from app.models.entities import (
    Action,
    Event,
    NewsItem,
    Risk,
)
from app.repositories import (
    ActionRepository,
    EventRepository,
    NewsRepository,
    RiskRepository,
    TwinRepository,
)
from app.services.digital_twin import DigitalTwinService
from app.services.event_extraction import EventExtractionService
from app.services.impact import ImpactService
from app.services.matching import MatchingService
from app.services.recommendations import RecommendationService
from app.services.risk_scoring import RiskScoringService
from app.services.scenario import ScenarioService

logger = get_logger(__name__)


@dataclass
class PipelineResult:
    news: NewsItem
    event: Event
    risk: Risk | None
    actions: list[Action]
    matched: bool


class IntelligencePipeline:
    def __init__(self, session) -> None:
        self.news_repo = NewsRepository(session)
        self.event_repo = EventRepository(session)
        self.risk_repo = RiskRepository(session)
        self.action_repo = ActionRepository(session)
        self.twin_service = DigitalTwinService(TwinRepository(session))
        self.extractor = EventExtractionService()
        self.matcher = MatchingService()
        self.scorer = RiskScoringService()
        self.impact = ImpactService()
        self.recommender = RecommendationService(ScenarioService())

    def process(self, company_id: int, news: NewsItem) -> PipelineResult:
        """Run the full pipeline for one (already-persisted) news item."""
        event = self.extractor.extract(news)
        event = self.event_repo.add(event)

        graph = self.twin_service.build_graph(company_id)
        match = self.matcher.match(event, graph)

        if match is None:
            logger.info("Event %s not relevant to company %s — dropped.", event.id, company_id)
            return PipelineResult(news, event, None, [], matched=False)

        coverage = self.impact._coverage_days(match, graph)  # reuse coverage calc
        result = self.scorer.score(event, match.supplier, coverage_days=coverage)
        impact_tiles, revenue = self.impact.predict(match, graph, result.score)
        chain = self._build_chain(event, match, graph)

        risk = Risk(
            company_id=company_id,
            event_id=event.id,
            title=self._title(event, match),
            headline=event.summary or news.title,
            supplier=match.supplier.name,
            severity=result.severity,
            score=result.score,
            confidence=result.confidence,
            reasoning=self._reasoning(event, match, result, coverage),
            revenue_at_risk=revenue,
            factors=result.factors,
            impact=impact_tiles,
            chain=chain,
        )
        risk = self.risk_repo.add(risk)

        actions = self._persist_recommendations(company_id, risk)
        logger.info("Pipeline produced risk %s (score %s) for company %s.",
                    risk.id, risk.score, company_id)
        return PipelineResult(news, event, risk, actions, matched=True)

    # -- helpers --------------------------------------------------------------
    def _persist_recommendations(self, company_id: int, risk: Risk) -> list[Action]:
        actions: list[Action] = []
        for rec in self.recommender.recommend(risk):
            action = Action(
                company_id=company_id, risk_id=risk.id, title=rec.title,
                owner=rec.department, deadline=rec.deadline, priority=rec.priority,
                status=self.recommender.initial_status(),
                estimated_benefit=rec.estimated_benefit,
                estimated_cost=rec.estimated_cost, department=rec.department,
            )
            actions.append(self.action_repo.add(action))
        return actions

    @staticmethod
    def _title(event: Event, match) -> str:
        place = event.country or event.location or "Global"
        etype = event.type.replace("_", " ").title()
        return f"{place} {etype} — {match.supplier.name}"

    @staticmethod
    def _reasoning(event, match, result, coverage) -> str:
        dep = int(float(match.supplier.attributes.get("dependency_share", 0.4)) * 100)
        alt = int(match.supplier.attributes.get("alt_suppliers", 1))
        return (
            f"A {event.type.replace('_', ' ')} event in {event.country or 'the region'} "
            f"threatens {match.supplier.name}, which accounts for {dep}% of dependent "
            f"volume with {alt} qualified alternate(s) on file. Current safety stock "
            f"covers roughly {coverage} days of production, producing a "
            f"{severity_label(result.severity).lower()} composite risk score of {result.score}."
        )

    def _build_chain(self, event, match, graph) -> list[str]:
        chain = [f"{event.country or 'Global'} {event.type.replace('_', ' ').title()}"]
        chain.append(f"Supplier: {match.supplier.name}")
        for key in match.affected_keys:
            node = graph.nodes.get(key)
            if not node or node.key == match.supplier.key:
                continue
            chain.append(f"{node.type.value.title()}: {node.name}")
        return chain
