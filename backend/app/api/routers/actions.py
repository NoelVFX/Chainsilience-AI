"""Action Center endpoints: Kanban board, status transitions, and the
mitigation feedback loop (completing a mitigation reduces the linked risk)."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.core.constants import severity_color, severity_label
from app.core.logging import get_logger
from app.db.session import get_session
from app.models.entities import Action, ActionStatus
from app.repositories import ActionRepository, RiskRepository
from app.schemas.domain import (
    ActionBoardResponse,
    ActionCard,
    ActionColumn,
    MoveActionRequest,
)
from app.services.risk_scoring import RiskScoringService

logger = get_logger(__name__)

router = APIRouter(prefix="/actions", tags=["actions"])

# Ordered columns for the 5-stage workflow.
_COLUMNS: list[tuple[ActionStatus, str]] = [
    (ActionStatus.RECOMMENDED, "Recommended"),
    (ActionStatus.APPROVED, "Approved"),
    (ActionStatus.ASSIGNED, "Assigned"),
    (ActionStatus.IN_PROGRESS, "In Progress"),
    (ActionStatus.COMPLETED, "Completed"),
]


def _card(a: Action) -> ActionCard:
    return ActionCard(
        id=a.id, title=a.title, owner=a.owner, deadline=a.deadline,
        priority=severity_label(a.priority).upper(),
        priority_color=severity_color(a.priority), status=a.status,
    )


@router.get("", response_model=ActionBoardResponse)
def board(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> ActionBoardResponse:
    actions = ActionRepository(session).for_company(company_id)
    by_status: dict[ActionStatus, list[ActionCard]] = {s: [] for s, _ in _COLUMNS}
    for a in actions:
        by_status.setdefault(a.status, []).append(_card(a))
    return ActionBoardResponse(
        columns=[
            ActionColumn(key=s, name=name, items=by_status.get(s, []))
            for s, name in _COLUMNS
        ]
    )


def _apply_mitigation_effect(
    session: Session,
    action: Action,
    *,
    apply_core_metrics: bool = True,
) -> None:
    """Reduce the linked risk's metrics when a mitigation completes.

    The reduction comes from the action's own estimated benefit (e.g.
    "64% risk reduction"); actions without a quantified benefit apply a modest
    5% improvement (any completed mitigation helps a little). Severity is
    re-banded from the new score, and the change is noted in the reasoning so
    the AI narrative stays consistent with the numbers.

    Also updates impact tiles and factors so Monte Carlo reflects the improved
    situation (lower stoppage probability on next risk detail view).
    """
    if not action.risk_id:
        return
    risk = RiskRepository(session).get(action.risk_id)
    if not risk:
        return

    m = re.search(r"(\d{1,3})\s*%", action.estimated_benefit or "")
    pct = min(95, int(m.group(1))) / 100 if m else 0.05

    old_score, old_rev = risk.score, risk.revenue_at_risk
    if apply_core_metrics:
        risk.score = max(0, round(risk.score * (1 - pct)))
        risk.revenue_at_risk = max(0.0, risk.revenue_at_risk * (1 - pct))
        risk.severity = RiskScoringService._band(risk.score)

    # --- Update impact tiles to reflect mitigation ---
    # Inventory Coverage: mitigation buys time → effective coverage increases
    # Recovery Time: mitigation accelerates recovery → weeks decrease
    # Production Delay: mitigation reduces delay → days decrease
    # Affected Products/Customers: mitigation contains spread → may decrease
    impact = risk.impact or []
    for tile in impact:
        label = tile.get("label", "")
        val = tile.get("value", "")
        if "Inventory Coverage" in label:
            # Extract days, increase by mitigation factor
            m2 = re.search(r"(\d+(?:\.\d+)?)", val)
            if m2:
                days = float(m2.group(1))
                # Mitigation improves effective coverage (e.g., air freight adds buffer)
                new_days = round(days * (1 + pct * 0.5))
                tile["value"] = f"{new_days} days"
        elif "Recovery Time" in label:
            m2 = re.search(r"(\d+(?:\.\d+)?)", val)
            if m2:
                weeks = float(m2.group(1))
                new_weeks = max(1, round(weeks * (1 - pct * 0.7)))
                tile["value"] = f"{new_weeks} weeks"
        elif "Production Delay" in label:
            m2 = re.search(r"(\d+(?:\.\d+)?)", val)
            if m2:
                days = float(m2.group(1))
                new_days = max(1, round(days * (1 - pct * 0.8)))
                # Keep range format if present
                if "–" in val or "-" in val:
                    m3 = re.search(r"(\d+)\D+(\d+)", val)
                    if m3:
                        low, high = int(m3.group(1)), int(m3.group(2))
                        new_low = max(1, round(low * (1 - pct * 0.8)))
                        new_high = max(new_low, round(high * (1 - pct * 0.8)))
                        tile["value"] = f"{new_low}–{new_high} days"
                    else:
                        tile["value"] = f"{new_days} days"
                else:
                    tile["value"] = f"{new_days} days"
        elif "Affected Products" in label:
            m2 = re.search(r"(\d+)", val)
            if m2:
                prods = int(m2.group(1))
                new_prods = max(1, round(prods * (1 - pct * 0.5)))
                tile["value"] = str(new_prods)
        elif "Affected Customers" in label:
            m2 = re.search(r"(\d+)", val)
            if m2:
                custs = int(m2.group(1))
                new_custs = max(1, round(custs * (1 - pct * 0.5)))
                tile["value"] = str(new_custs)
        elif "Revenue at Risk" in label:
            # Already updated via risk.revenue_at_risk; keep tile in sync
            from app.services.dashboard import _fmt_money
            tile["value"] = _fmt_money(risk.revenue_at_risk)

    # --- Update the risk-score breakdown to reflect mitigation ---
    # Factors are risk contributions (higher means greater exposure), not raw
    # supplier counts. Keep the event's inherent severity mostly intact, while
    # reducing the controllable operational exposures. This makes the persisted
    # score breakdown agree with the improved score, impact tiles, and the next
    # Monte Carlo run shown on the Risk Detail screen.
    factors = risk.factors or []
    for f in factors:
        label = f.get("label", "")
        current = float(f.get("value", 0) or 0)
        if "Event Severity" in label:
            f["value"] = max(0, round(current * (1 - pct * 0.25)))
        if "Alternative Suppliers" in label:
            # This is an exposure contribution: switching/qualifying alternates
            # must lower it, rather than treating the 0-100 value as a count.
            if "switch" in (action.title or "").lower():
                f["value"] = max(0, round(current * (1 - pct * 0.80)))
            else:
                f["value"] = max(0, round(current * (1 - pct * 0.35)))
        elif "Inventory Coverage" in label:
            # Recalculate from the increased effective coverage, then apply the
            # mitigation residual because the coverage is no longer exposed to
            # the same unmitigated disruption path.
            for tile in impact:
                if "Inventory Coverage" in tile.get("label", ""):
                    m2 = re.search(r"(\d+(?:\.\d+)?)", tile.get("value", ""))
                    if m2:
                        days = float(m2.group(1))
                        # Factor: less coverage = higher risk contribution (0-100)
                        coverage_risk = max(0, 100 - min(days, 60) * 100 / 60)
                        f["value"] = round(coverage_risk * (1 - pct * 0.50))
                    break
        elif "Supplier Dependency" in label:
            # Mitigation reduces effective dependency
            f["value"] = max(0, round(current * (1 - pct * 0.5)))
        elif "Geographic Exposure" in label:
            # The event remains geographic, but diversified routing/sourcing
            # reduces the share still exposed to it.
            f["value"] = max(0, round(current * (1 - pct * 0.25)))

    risk.factors = factors
    risk.impact = impact
    applied_action_ids = list(risk.mitigation_action_ids or [])
    if action.id is not None and action.id not in applied_action_ids:
        applied_action_ids.append(action.id)
    risk.mitigation_action_ids = applied_action_ids

    if apply_core_metrics:
        note = (
            f" [Mitigation completed: “{action.title}” — risk reduced by "
            f"{int(pct * 100)}% (score {old_score}→{risk.score})]"
        )
        risk.reasoning = (risk.reasoning or "") + note
    session.add(risk)
    session.commit()
    logger.info(
        "Mitigation %s completed: risk %s score %s->%s, revenue %.0f->%.0f",
        action.id, risk.id, old_score, risk.score, old_rev, risk.revenue_at_risk,
    )


@router.patch("/{action_id}", response_model=ActionCard)
def move(
    action_id: int,
    payload: MoveActionRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> ActionCard:
    repo = ActionRepository(session)
    action = repo.get(action_id)
    if not action or action.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")

    was_completed = action.status == ActionStatus.COMPLETED
    updated = repo.update_status(action, payload.status)

    # Feedback loop: apply the risk reduction exactly once, on the transition
    # into Completed.
    if payload.status == ActionStatus.COMPLETED and not was_completed:
        _apply_mitigation_effect(session, updated)

    return _card(updated)


@router.delete("/{action_id}")
def delete_action(
    action_id: int,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Remove a **completed** mitigation from the board (its risk reduction has
    already been applied). In-flight actions can't be deleted."""
    repo = ActionRepository(session)
    action = repo.get(action_id)
    if not action or action.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action not found")
    if action.status != ActionStatus.COMPLETED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Only completed actions can be removed from the board.",
        )
    repo.delete(action)
    return {"deleted": action_id}
