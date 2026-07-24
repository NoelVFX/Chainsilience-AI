"""Monte Carlo simulation of production-stoppage probability.

Given a scored risk, we don't know the future exactly — the disruption duration,
how long our inventory really lasts, and whether an alternate supplier can be
brought online in time are all uncertain. We therefore sample those quantities
from distributions parameterised by the company's own data (the risk's impact
tiles + factors) across many scenarios, and report the fraction in which
**production stops** — i.e. the disruption outlasts inventory coverage and no
alternate supplier bridges the gap.

Deterministic: the RNG is seeded per-risk so the same risk always yields the same
probability (stable for demos and auditing), while still being a real simulation.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass

from app.models.entities import Risk

DEFAULT_ITERATIONS = 10_000


@dataclass
class MonteCarloInputs:
    coverage_days: float       # inventory runway (days of production)
    recovery_days: float       # expected disruption / supplier recovery duration
    delay_days: float          # observed production delay so far
    alt_availability: float    # 0-1 probability a qualified alternate exists


def _num(text: str) -> float | None:
    m = re.search(r"(\d+(?:\.\d+)?)", text or "")
    return float(m.group(1)) if m else None


def _last_num(text: str) -> float | None:
    nums = re.findall(r"(\d+(?:\.\d+)?)", text or "")
    return float(nums[-1]) if nums else None


class MonteCarloService:
    @staticmethod
    def twin_context(nodes, edges, supplier_name: str) -> tuple[dict, float | None]:
        """Resolve real Digital Twin data for a risk's supplier.

        Returns (supplier_attributes, coverage_days_of_a_component_it_supplies).
        """
        supplier = next(
            (n for n in nodes
             if n.type.value == "supplier" and n.name.lower() == (supplier_name or "").lower()),
            None,
        )
        if supplier is None:
            return {}, None
        supplied = {e.target_key for e in edges
                    if e.source_key == supplier.key and e.type.value == "supplies"}
        coverages = [
            float(n.attributes.get("coverage_days"))
            for n in nodes
            if n.key in supplied and n.attributes.get("coverage_days") is not None
        ]
        # The tightest component runway is what actually constrains production.
        return dict(supplier.attributes or {}), (min(coverages) if coverages else None)

    def inputs_from_risk(
        self,
        risk: Risk,
        supplier_attrs: dict | None = None,
        coverage_hint: float | None = None,
    ) -> MonteCarloInputs:
        """Build simulation inputs, preferring the most specific data available:
        stored impact tiles/factors → the Digital Twin → the risk's own score.
        """
        tiles = {t.get("label", ""): t.get("value", "") for t in (risk.impact or [])}
        factors = {f.get("label", ""): f.get("value", 0) for f in (risk.factors or [])}
        attrs = supplier_attrs or {}
        score = max(0, min(100, int(risk.score or 0)))

        # --- disruption duration -------------------------------------------
        rec_raw = tiles.get("Recovery Time", "")
        recovery = _num(rec_raw)
        if recovery is not None and "week" in rec_raw.lower():
            recovery *= 7
        if recovery is None:
            # Severity drives how long the disruption lasts (7–56 days).
            recovery = 7.0 + (score / 100.0) * 49.0

        # --- inventory runway ------------------------------------------------
        coverage = _num(tiles.get("Inventory Coverage") or tiles.get("Inventory Depletion") or "")
        if coverage is None:
            coverage = coverage_hint if coverage_hint is not None else 21.0

        # --- production delay already observed -------------------------------
        delay = _last_num(tiles.get("Production Delay", ""))
        if delay is None:
            delay = max(2.0, recovery * 0.25)

        # --- alternate supplier availability ---------------------------------
        alt_factor = factors.get("Alternative Suppliers")
        if alt_factor is not None:
            # Factor is read as availability adequacy (0-100).
            alt_availability = float(alt_factor) / 100.0
        elif attrs.get("alt_suppliers") is not None:
            # Real twin data: each qualified alternate materially improves odds.
            alt_availability = 0.05 + min(0.85, float(attrs["alt_suppliers"]) * 0.30)
        else:
            # Last resort: a more severe risk implies fewer usable alternates.
            alt_availability = max(0.05, 1.0 - score / 100.0)

        return MonteCarloInputs(
            coverage_days=coverage,
            recovery_days=recovery,
            delay_days=delay,
            alt_availability=max(0.0, min(1.0, alt_availability)),
        )

    def stoppage_probability(
        self, params: MonteCarloInputs, iterations: int = DEFAULT_ITERATIONS, seed: int = 0
    ) -> float:
        rng = random.Random(seed)
        cov_mu = max(1.0, params.coverage_days)
        rec_mu = max(1.0, params.recovery_days)
        stops = 0

        for _ in range(iterations):
            # Disruption duration: uncertain, centred on the expected recovery.
            duration = rng.gauss(rec_mu, rec_mu * 0.30)
            duration = max(params.delay_days, duration)
            # Effective inventory coverage: varies with real consumption.
            coverage = max(0.0, rng.gauss(cov_mu, cov_mu * 0.25))

            if duration <= coverage:
                continue  # inventory absorbs the whole disruption — no stoppage

            # Inventory runs out before recovery → need an alternate to bridge it.
            if rng.random() < params.alt_availability:
                # Time to qualify/ramp an alternate; if it beats stock-out, no stop.
                alt_lead = max(0.0, rng.gauss(cov_mu * 1.1, cov_mu * 0.35))
                if alt_lead <= coverage:
                    continue
            stops += 1

        return stops / iterations

    def stoppage_tile(
        self,
        risk: Risk,
        supplier_attrs: dict | None = None,
        coverage_hint: float | None = None,
        iterations: int = DEFAULT_ITERATIONS,
    ) -> dict:
        params = self.inputs_from_risk(risk, supplier_attrs, coverage_hint)
        prob = self.stoppage_probability(params, iterations=iterations, seed=(risk.id or 0) + 7)
        return {"label": "Production Stoppage", "value": f"{round(prob * 100)}%"}
