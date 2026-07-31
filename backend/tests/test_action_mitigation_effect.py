"""Regression tests for completed mitigation feedback on a linked risk."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.actions import _apply_mitigation_effect
from app.api.routers.risks import _reconcile_legacy_completed_mitigations
from app.models.entities import Action, Risk, Severity
from app.services.monte_carlo import MonteCarloService


class _RiskRepository:
    def __init__(self, risk: Risk) -> None:
        self.risk = risk

    def get(self, risk_id: int) -> Risk | None:
        return self.risk if self.risk.id == risk_id else None


class _Session:
    def __init__(self, risk: Risk) -> None:
        self.risk = risk
        self.committed = False

    def add(self, entity: object) -> None:
        assert entity is self.risk

    def get(self, _model: object, risk_id: int) -> Risk | None:
        return self.risk if self.risk.id == risk_id else None

    def commit(self) -> None:
        self.committed = True


def _risk() -> Risk:
    return Risk(
        id=7,
        company_id=1,
        title="Factory disruption",
        severity=Severity.HIGH,
        score=74,
        revenue_at_risk=1_000_000,
        factors=[
            {"label": "Event Severity", "value": 74},
            {"label": "Supplier Dependency", "value": 80},
            {"label": "Inventory Coverage", "value": 70},
            {"label": "Alternative Suppliers", "value": 70},
        ],
        impact=[
            {"label": "Revenue at Risk", "value": "$1.0M"},
            {"label": "Production Delay", "value": "10–20 days"},
            {"label": "Recovery Time", "value": "6 weeks"},
            {"label": "Inventory Coverage", "value": "14 days"},
        ],
        reasoning="Original risk reasoning.",
    )


class CompletedMitigationEffectTests(unittest.TestCase):
    def test_completed_mitigation_reduces_risk_breakdown_and_predicted_impact(self) -> None:
        risk = _risk()
        session = _Session(risk)
        monte_carlo = MonteCarloService()
        before_probability = monte_carlo.stoppage_probability(
            monte_carlo.inputs_from_risk(risk, event_type="earthquake"),
            iterations=2_000,
            seed=14,
        )
        action = Action(
            id=11,
            company_id=1,
            risk_id=risk.id,
            title="Increase Inventory Buffer — Factory disruption",
            estimated_benefit="50% risk reduction",
        )

        with patch(
            "app.api.routers.actions.RiskRepository",
            return_value=_RiskRepository(risk),
        ):
            _apply_mitigation_effect(session, action)

        values = {tile["label"]: tile["value"] for tile in risk.impact}
        factors = {factor["label"]: factor["value"] for factor in risk.factors}

        self.assertTrue(session.committed)
        self.assertLess(risk.score, 74)
        self.assertEqual(risk.severity, Severity.LOW)
        self.assertLess(risk.revenue_at_risk, 1_000_000)
        self.assertNotEqual(values["Revenue at Risk"], "$1.0M")
        self.assertNotEqual(values["Production Delay"], "10–20 days")
        self.assertNotEqual(values["Recovery Time"], "6 weeks")
        self.assertLess(factors["Supplier Dependency"], 80)
        self.assertLess(factors["Inventory Coverage"], 70)
        self.assertLess(factors["Alternative Suppliers"], 70)
        self.assertEqual(getattr(risk, "mitigation_action_ids", None), [action.id])
        self.assertGreaterEqual(float(values["Inventory Coverage"].split()[0]), 30)

        after_probability = monte_carlo.stoppage_probability(
            monte_carlo.inputs_from_risk(risk, event_type="earthquake"),
            iterations=2_000,
            seed=14,
        )
        self.assertLess(after_probability, before_probability)
        self.assertLess(after_probability, 0.50)

    def test_legacy_completed_action_repairs_detail_metrics_without_reducing_score_twice(self) -> None:
        risk = _risk()
        risk.score = 37
        risk.revenue_at_risk = 500_000
        session = _Session(risk)
        action = Action(
            id=12,
            company_id=1,
            risk_id=risk.id,
            title="Increase Inventory Buffer — Factory disruption",
            estimated_benefit="50% risk reduction",
        )

        _reconcile_legacy_completed_mitigations(session, risk, [action])

        values = {tile["label"]: tile["value"] for tile in risk.impact}
        self.assertEqual(risk.score, 37)
        self.assertEqual(risk.revenue_at_risk, 500_000)
        self.assertNotEqual(values["Production Delay"], "10–20 days")
        self.assertNotEqual(values["Recovery Time"], "6 weeks")
        self.assertGreaterEqual(float(values["Inventory Coverage"].split()[0]), 30)
        self.assertEqual(risk.mitigation_action_ids, [action.id])

        repaired_impact = [dict(tile) for tile in risk.impact]
        _reconcile_legacy_completed_mitigations(session, risk, [action])
        self.assertEqual(risk.impact, repaired_impact)


if __name__ == "__main__":
    unittest.main()
