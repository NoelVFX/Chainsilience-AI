"""Risk endpoints: list, detail, and AI mitigation-email generation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.core.constants import severity_color, severity_label
from app.core.timeutil import relative_time
from app.db.session import get_session
from app.models.entities import Action, NodeType, Risk
from app.repositories import ActionRepository, EmailDraftRepository, EventRepository, RiskRepository, TwinRepository
from app.schemas.domain import (
    EmailRequest,
    EmailResponse,
    EmailSaveRequest,
    Factor,
    ImpactTile,
    RiskCard,
    RiskDetailResponse,
)
from app.services.email_gen import EmailService
from app.services.monte_carlo import MonteCarloService

router = APIRouter(prefix="/risks", tags=["risks"])


def _card(r: Risk) -> RiskCard:
    from app.services.dashboard import _fmt_money  # local import avoids cycle

    return RiskCard(
        id=r.id, title=r.title, supplier=r.supplier,
        severity=severity_label(r.severity), severity_color=severity_color(r.severity),
        impact=f"{_fmt_money(r.revenue_at_risk)} at risk", time=relative_time(r.created_at),
    )


@router.get("", response_model=list[RiskCard])
def list_risks(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> list[RiskCard]:
    return [_card(r) for r in RiskRepository(session).for_company(company_id)]


def _load_risk(risk_id: int, company_id: int, session: Session) -> Risk:
    risk = RiskRepository(session).get(risk_id)
    if not risk or risk.company_id != company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Risk not found")
    return risk


def _reconcile_legacy_completed_mitigations(
    session: Session,
    risk: Risk,
    completed_actions: list[Action],
) -> None:
    """Repair auxiliary metrics for completions recorded before mitigation IDs.

    Older deployments reduced the headline score but did not consistently update
    the factor/impact tiles. Apply their tile/factor effect once, without
    reducing score or revenue a second time, then persist the action ID.
    """
    applied = set(risk.mitigation_action_ids or [])
    pending = [a for a in completed_actions if a.id is not None and a.id not in applied]
    if not pending:
        return

    # Local import avoids coupling Action Center's normal mutation path to the
    # Risk Detail router at application import time.
    from app.api.routers.actions import _apply_mitigation_effect

    for action in pending:
        _apply_mitigation_effect(session, action, apply_core_metrics=False)


@router.get("/{risk_id}", response_model=RiskDetailResponse)
def risk_detail(
    risk_id: int,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> RiskDetailResponse:
    r = _load_risk(risk_id, company_id, session)
    assert r.id is not None
    _reconcile_legacy_completed_mitigations(
        session,
        r,
        ActionRepository(session).completed_for_risk(company_id, r.id),
    )

    # Normalise legacy tile labels stored in older risk records / AI output, so
    # renamed metrics show correctly regardless of what's persisted.
    label_map = {"Revenue Loss": "Revenue at Risk", "Inventory Depletion": "Inventory Coverage"}
    impact = [
        {**t, "label": label_map.get(t.get("label", ""), t.get("label", ""))}
        for t in (r.impact or [])
    ]

    # Production-stoppage probability is ALWAYS computed by our Monte Carlo (10k
    # scenarios) — never trusted from stored data or the LLM — so drop any
    # existing tile and append a freshly simulated one. Inputs come from this
    # risk's metrics, the supplier's real Digital Twin attributes, and the
    # disruption's event type, so each risk yields its own probability.
    impact = [t for t in impact if t.get("label") != "Production Stoppage"]
    mc = MonteCarloService()
    twin = TwinRepository(session)
    supplier_attrs, coverage_hint = mc.twin_context(
        twin.nodes(company_id), twin.edges(company_id), r.supplier
    )
    event = EventRepository(session).get(r.event_id) if r.event_id else None
    impact.append(mc.stoppage_tile(
        r, supplier_attrs, coverage_hint, event_type=(event.type if event else None)
    ))

    return RiskDetailResponse(
        id=r.id, title=r.headline or r.title, headline=r.headline or r.title,
        severity=severity_label(r.severity).upper(), severity_color=severity_color(r.severity),
        score=r.score, confidence=r.confidence, time=relative_time(r.created_at),
        reasoning=r.reasoning,
        factors=[Factor(**f) for f in r.factors],
        impact=[ImpactTile(**i) for i in impact],
        chain=r.chain,
    )


@router.get("/{risk_id}/paths")
def risk_dependency_paths(
    risk_id: int,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Supply-chain dependency paths downstream of this risk's disrupted supplier.

    Computed by the **Neo4j** knowledge graph (Cypher variable-length paths) when
    it's configured, with a transparent in-memory graph-traversal fallback so the
    panel always renders. ``source`` tells the UI which engine produced it.
    """
    from app.services.digital_twin import DigitalTwinService

    r = _load_risk(risk_id, company_id, session)
    twin = TwinRepository(session)
    nodes = twin.nodes(company_id)

    # Resolve the disrupted supplier's twin-node key from the risk's supplier name,
    # falling back to any supplier node so the panel still shows a real path.
    start = next(
        (n.key for n in nodes if n.type == NodeType.SUPPLIER and n.name == r.supplier),
        None,
    )
    if start is None:
        sup = next((n for n in nodes if n.type == NodeType.SUPPLIER), None)
        start = sup.key if sup else None
    if start is None:
        return {"source": "none", "start": None, "supplier": r.supplier, "paths": []}

    result = DigitalTwinService(twin).dependency_paths(company_id, start)
    result["supplier"] = r.supplier
    return result


@router.post("/{risk_id}/email", response_model=EmailResponse)
def get_or_generate_email(
    risk_id: int,
    payload: EmailRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> EmailResponse:
    """Return the saved draft for (risk, kind) if one exists; otherwise draft a
    fresh one with the AI (without persisting it until the user saves)."""
    r = _load_risk(risk_id, company_id, session)
    saved = EmailDraftRepository(session).get(company_id, risk_id, payload.kind)
    if saved:
        return EmailResponse(subject=saved.subject, body=saved.body, kind=payload.kind, saved=True)
    subject, body = EmailService().generate(r, payload.kind)
    return EmailResponse(subject=subject, body=body, kind=payload.kind, saved=False)


@router.put("/{risk_id}/email", response_model=EmailResponse)
def save_email_draft(
    risk_id: int,
    payload: EmailSaveRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> EmailResponse:
    """Persist the user's edited draft so reopening loads exactly what they saved."""
    _load_risk(risk_id, company_id, session)
    draft = EmailDraftRepository(session).upsert(
        company_id, risk_id, payload.kind, payload.subject, payload.body
    )
    return EmailResponse(subject=draft.subject, body=draft.body, kind=draft.kind, saved=True)
