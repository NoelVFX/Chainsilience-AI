"""Scenario simulator endpoints: simulate strategies and approve one."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.core.logging import get_logger
from app.db.session import engine, get_session
from app.models.entities import Action, ActionStatus, Severity
from app.repositories import ActionRepository, RiskRepository, TwinRepository
from app.schemas.domain import (
    ApproveScenarioRequest,
    ScenarioResponse,
    ScenarioTile,
)
from app.services.mitigation_scoring import MitigationScorer
from app.services.recommendations import RecommendationService
from app.services.scenario import ScenarioService

logger = get_logger(__name__)

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


def _normalise_ids(scenarios: list[dict]) -> list[dict]:
    """Guarantee stable, unique scenario ids (LLM output can omit/duplicate them)."""
    seen: set[str] = set()
    out: list[dict] = []
    for i, s in enumerate(scenarios):
        sid = str(s.get("id") or f"opt_{i}")
        if sid in seen:
            sid = f"opt_{i}"
        seen.add(sid)
        out.append({**s, "id": sid})
    return out


def _ensure_scenarios(session: Session, risk, company_id: int, *, force: bool) -> list[dict]:
    """Return the risk's persisted scenarios, generating + saving them once
    (or again on ``force``). Generation is the only place the LLM runs, so the
    option set is stable across reads/priority changes until explicitly refreshed.
    """
    if risk.scenarios and not force:
        stored = list(risk.scenarios)
        logger.info(
            "Scenario set for risk=%s: reusing %d persisted scenario(s), sources=%s",
            risk.id,
            len(stored),
            sorted({str(s.get("source", "unknown")) for s in stored}),
        )
        return stored

    twin_repo = TwinRepository(session)
    generated = ScenarioService().generate(
        risk, twin_nodes=twin_repo.nodes(company_id), twin_edges=twin_repo.edges(company_id)
    )
    risk.scenarios = _normalise_ids(generated)
    logger.info(
        "Scenario set for risk=%s: %s %d scenario(s), sources=%s",
        risk.id,
        "refreshing" if force else "generating",
        len(risk.scenarios),
        sorted({str(s.get("source", "unknown")) for s in risk.scenarios}),
    )
    session.add(risk)
    session.commit()
    session.refresh(risk)
    return list(risk.scenarios)


@router.get("/{risk_id}", response_model=ScenarioResponse)
def simulate(
    risk_id: int,
    priority: str = "balanced",
    refresh: bool = False,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> ScenarioResponse:
    """Return the risk's mitigation options, ranked by a multi-objective score.

    The option set is **persisted** and stable: changing ``priority`` only
    re-ranks the same set. Pass ``refresh=true`` to regenerate the strategies.
    """
    risk = RiskRepository(session).get(risk_id)
    if not risk or risk.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Risk not found")

    priority = priority if priority in MitigationScorer.PRIORITIES else "balanced"
    scenarios = _ensure_scenarios(session, risk, company_id, force=refresh)
    ranked = MitigationScorer().rank(scenarios, priority)
    return ScenarioResponse(
        risk_id=risk.id,
        risk_title=risk.headline or risk.title,
        scenarios=[ScenarioTile(**s) for s in ranked],
        priority=priority,
    )


def _generate_recommendations(company_id: int, risk_id: int) -> None:
    """Background task: generate the event's recommendations (may call the LLM).

    Runs after the approve response is sent — with its own session — so the
    approve request returns fast and the client navigates without timing out on
    a slow model call. Deduped, so re-running is harmless.
    """
    try:
        with Session(engine) as bg:
            risk = RiskRepository(bg).get(risk_id)
            if not risk or risk.company_id != company_id:
                return
            repo = ActionRepository(bg)
            for rec in RecommendationService(ScenarioService()).recommend(risk):
                repo.add_unique(
                    Action(
                        company_id=company_id, risk_id=risk.id, title=rec.title,
                        owner=rec.department, deadline=rec.deadline, priority=rec.priority,
                        status=ActionStatus.RECOMMENDED,
                        estimated_benefit=rec.estimated_benefit,
                        estimated_cost=rec.estimated_cost, department=rec.department,
                    )
                )
    except Exception as exc:  # noqa: BLE001 — never crash the background worker
        logger.warning("Background recommendation generation failed: %s", exc)


@router.post("/{risk_id}/approve")
def approve(
    risk_id: int,
    payload: ApproveScenarioRequest,
    background_tasks: BackgroundTasks,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Approve a scenario → send it to the Action Center (fast).

    Creates the approved action synchronously and returns immediately; the
    event's recommendations are generated in a background task (which may call
    the LLM) so the request never blocks the UI navigation.
    Approving the same scenario twice is rejected ("already approved").
    """
    risk = RiskRepository(session).get(risk_id)
    if not risk or risk.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Risk not found")

    # Look the scenario up in the risk's PERSISTED set (same ids the UI showed),
    # so approve never regenerates or loses the selection.
    scenarios = _ensure_scenarios(session, risk, company_id, force=False)
    scenario = next((s for s in scenarios if s["id"] == payload.scenario_id), None)
    if not scenario:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown scenario")

    repo = ActionRepository(session)
    title = f"{scenario['name']} — {risk.title}"

    # Reject a duplicate approval of the same scenario.
    if repo.exists_title(company_id, title):
        return {
            "approved": False,
            "status": "already_approved",
            "message": f"\"{scenario['name']}\" is already approved and in the Action Center.",
        }

    action = repo.add(
        Action(
            company_id=company_id,
            risk_id=risk.id,
            title=title,
            owner="Procurement",
            deadline="",
            priority=Severity.CRITICAL if risk.severity == Severity.CRITICAL else Severity.HIGH,
            status=ActionStatus.APPROVED,
            estimated_benefit=f"{scenario['risk_reduction']} risk reduction",
            estimated_cost=scenario["cost"],
            department="Procurement",
        )
    )

    # Generate recommendations off the request path (may hit the LLM).
    background_tasks.add_task(_generate_recommendations, company_id, risk.id)

    return {
        "approved": True,
        "status": action.status.value,
        "action_id": action.id,
        "message": "Approved and sent to the Action Center.",
    }