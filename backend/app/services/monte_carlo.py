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
    def inputs_from_risk(self, risk: Risk) -> MonteCarloInputs:
        tiles = {t.get("label", ""): t.get("value", "") for t in (risk.impact or [])}
        factors = {f.get("label", ""): f.get("value", 0) for f in (risk.factors or [])}

        coverage = _num(tiles.get("Inventory Coverage") or tiles.get("Inventory Depletion") or "")
        # Recovery may be given in weeks or days.
        rec_raw = tiles.get("Recovery Time", "")
        recovery = _num(rec_raw)
        if recovery is not None and "week" in rec_raw.lower():
            recovery *= 7
        delay = _last_num(tiles.get("Production Delay", ""))  # upper bound of the range
        # "Alternative Suppliers" factor is read as availability adequacy (0-100).
        alt = factors.get("Alternative Suppliers")
        alt_availability = (float(alt) / 100.0) if alt is not None else 0.4

        return MonteCarloInputs(
            coverage_days=coverage if coverage is not None else 21.0,
            recovery_days=recovery if recovery is not None else 30.0,
            delay_days=delay if delay is not None else 7.0,
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

    def stoppage_tile(self, risk: Risk, iterations: int = DEFAULT_ITERATIONS) -> dict:
        params = self.inputs_from_risk(risk)
        prob = self.stoppage_probability(params, iterations=iterations, seed=(risk.id or 0) + 7)
        return {"label": "Production Stoppage", "value": f"{round(prob * 100)}%"}
