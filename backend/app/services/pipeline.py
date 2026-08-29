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
from app.services.agents.relevance import RelevanceAgent, build_profile
from app.services.agents.verifier import VerifierAgent
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
    event: Event | None
    risk: Risk | None
    actions: list[Action]
    matched: bool
    filtered: bool = False  # dropped by an agent-layer filter
    reason: str = ""
    filter_stage: str = ""  # "verifier" | "relevance" | "match"


class IntelligencePipeline:
    def __init__(self, session, company=None) -> None:
        self.session = session
        self.company = company
        self.news_repo = NewsRepository(session)
        self.event_repo = EventRepository(session)
        self.risk_repo = RiskRepository(session)
        self.action_repo = ActionRepository(session)
        self.twin_service = DigitalTwinService(TwinRepository(session))
        self.verifier = VerifierAgent()
        self.relevance = RelevanceAgent()
        self.extractor = EventExtractionService()
        self.matcher = MatchingService()
        self.scorer = RiskScoringService()
        self.impact = ImpactService()
        self.recommender = RecommendationService(ScenarioService())

    def process(self, company_id: int, news: NewsItem) -> PipelineResult:
        """Run the full pipeline for one (already-persisted) news item.

        Agent layer (Nemotron), each with an offline fallback:
          1. Verifier      — drop unsupported / unreliable (rumour, clickbait) news.
          2. Relevance     — drop news that doesn't touch this company's twin paths.
        Only news passing both is extracted, matched, scored, and impact-assessed.
        """
        # --- Agent 1: reliability verifier ----------------------------------
        v = self.verifier.verify(news)
        if not v.passed:
            logger.info("Verifier dropped news %s (%s).", news.id, v.reason)
            return PipelineResult(news, None, None, [], matched=False,
                                  filtered=True, reason=v.reason, filter_stage="verifier")

        graph = self.twin_service.build_graph(company_id)

        # --- Agent 2: company-relevance extractor ---------------------------
        countries = getattr(self.company, "countries", "") or ""
        profile = build_profile(graph, countries)
        r = self.relevance.assess(news, profile)
        if not r.relevant:
            logger.info("Relevance dropped news %s (%s).", news.id, r.reason)
            return PipelineResult(news, None, None, [], matched=False,
                                  filtered=True, reason=r.reason, filter_stage="relevance")

        event = self.extractor.extract(news)
        event = self.event_repo.add(event)

        match = self.matcher.match(event, graph)
        if match is None:
            logger.info("Event %s not bound to a supplier for company %s.", event.id, company_id)
            return PipelineResult(news, event, None, [], matched=False,
                                  filtered=True, reason="No supplier path bound.",
                                  filter_stage="match")

        # De-dupe: don't recreate a risk for an event we've already surfaced.
        dup_title = self._title(event, match)
        if self.risk_repo.exists_title(company_id, dup_title):
            logger.info("Skipping duplicate risk '%s' for company %s.", dup_title, company_id)
            return PipelineResult(news, event, None, [], matched=False,
                                  filtered=True, reason="Duplicate risk.",
                                  filter_stage="duplicate")

        coverage = self.impact._coverage_days(match, graph)  # reuse coverage calc
        result = self.scorer.score(event, match.supplier, coverage_days=coverage)
        impact_tiles, revenue = self.impact.predict(match, graph, result.score)
        chain = self._build_chain(event, match, graph)

        score = result.score
        severity = result.severity
        confidence = result.confidence
        factors = result.factors

        # Quantitative AI assessment: the model refines the metrics, grounded by
        # the deterministic baseline. Validated + clamped, with fallback.
        score, severity, confidence, revenue, factors, impact_tiles = self._ai_assess(
            event, match, score, severity, confidence, revenue, factors, impact_tiles
        )

        risk = Risk(
            company_id=company_id,
            event_id=event.id,
            title=self._title(event, match),
            headline=event.summary or news.title,
            supplier=match.supplier.name,
            severity=severity,
            score=score,
            confidence=confidence,
            reasoning=self._reasoning(event, match, result, coverage),
            revenue_at_risk=revenue,
            factors=factors,
            impact=impact_tiles,
            chain=chain,
        )
        risk = self.risk_repo.add(risk)

        # Recommendations are intentionally NOT created here — they only enter the
        # Action Center once the user approves a scenario for this event
        # (see /scenarios/{id}/approve).
        logger.info("Pipeline produced risk %s (score %s) for company %s.",
                    risk.id, risk.score, company_id)
        return PipelineResult(news, event, risk, [], matched=True)

    # -- helpers --------------------------------------------------------------
    def _ai_assess(self, event, match, score, severity, confidence, revenue, factors, impact_tiles):
        """Refine metrics with the AI agent, validating against the baseline."""
        from app.models.entities import Severity
        from app.services.ai.adapter import ai_client

        if not ai_client.live:
            return score, severity, confidence, revenue, factors, impact_tiles

        data = ai_client.assess_risk({
            "event_type": event.type,
            "country": event.country,
            "supplier": match.supplier.name,
            "supplier_attributes": match.supplier.attributes,
            "baseline": {
                "score": score, "severity": severity.value, "confidence": confidence,
                "revenue_at_risk": revenue, "factors": factors, "impact": impact_tiles,
            },
        })
        if not data:
            return score, severity, confidence, revenue, factors, impact_tiles

        try:
            if "score" in data:
                score = max(0, min(100, int(data["score"])))
            if data.get("severity"):
                severity = Severity(str(data["severity"]).lower())
            if "confidence" in data:
                confidence = max(0.0, min(1.0, float(data["confidence"])))
            if "revenue_at_risk" in data:
                rev = float(data["revenue_at_risk"])
                # Guard against wild values: keep within 10x of the baseline.
                if revenue and 0 < rev <= revenue * 10:
                    revenue = rev
                elif not revenue and rev > 0:
                    revenue = rev
            if isinstance(data.get("factors"), list) and data["factors"]:
                factors = [
                    {"label": str(f["label"]), "value": max(0, min(100, int(f["value"])))}
                    for f in data["factors"] if "label" in f and "value" in f
                ] or factors
            if isinstance(data.get("impact"), list) and data["impact"]:
                impact_tiles = [
                    {"label": str(i["label"]), "value": str(i["value"])}
                    for i in data["impact"] if "label" in i and "value" in i
                ] or impact_tiles
            logger.info("AI risk assessment applied (provider=%s).", ai_client.provider)
        except (ValueError, KeyError, TypeError) as exc:
            logger.info("AI assessment invalid (%s); keeping deterministic.", exc)
        return score, severity, confidence, revenue, factors, impact_tiles

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
