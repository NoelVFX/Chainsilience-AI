"""Company onboarding + Digital Twin endpoints."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session

from app.api.deps import get_current_company_id, get_current_user
from app.db.session import get_session
from app.models.entities import Company, Node, NodeType, User
from app.repositories import (
    ActionRepository,
    CompanyRepository,
    EmailDraftRepository,
    FeedbackRepository,
    RiskRepository,
    TwinRepository,
    UserRepository,
)
from app.schemas.domain import CompanyResponse, OnboardingRequest
from app.services.digital_twin import DigitalTwinService
from app.services.rag_company import get_company_rag
from app.services.twin_builder import TwinBuilder

router = APIRouter(prefix="/company", tags=["company"])


@router.post("/onboarding", response_model=CompanyResponse)
def onboarding(
    payload: OnboardingRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CompanyResponse:
    """Create/attach the caller's company and build a working Digital Twin.

    A brand-new company is bootstrapped into a coherent, connected twin from its
    profile. Risks are NOT fabricated — the dashboard populates from real scraped
    news via the pipeline/poller. Re-onboarding with a changed profile rebuilds
    the twin so its supplier countries follow the new profile (no stale geography).
    """
    companies = CompanyRepository(session)
    if user.company_id:
        company = companies.get(user.company_id)
        company.name = payload.company_name
    else:
        company = Company(name=payload.company_name)

    prev_countries = company.countries or ""
    prev_products = company.primary_products or ""

    company.industry = payload.industry
    company.countries = payload.countries
    company.risk_tolerance = payload.risk_tolerance
    company.primary_products = payload.primary_products
    company.data_quality_score = company.data_quality_score or 60
    company = companies.update(company)

    if not user.company_id:
        user.company_id = company.id
        UserRepository(session).add(user)

    # First-time: bootstrap the twin. Re-onboarding with a changed country/product
    # profile: rebuild it so the twin's asset geography reflects the new profile
    # (and stale suppliers/risks from the old countries are cleared) — otherwise
    # relevance would keep matching news for countries the user no longer operates in.
    twin_repo = TwinRepository(session)
    if not twin_repo.nodes(company.id):
        TwinBuilder(session).bootstrap_from_profile(company)
    elif payload.countries != prev_countries or payload.primary_products != prev_products:
        _rebuild_twin(session, company)

    # Index the freshly-built company data for RAG (best-effort, off the request).
    background_tasks.add_task(get_company_rag().reindex, company.id)
    # Mirror the twin into the Neo4j knowledge graph (no-op if not configured).
    background_tasks.add_task(_sync_graph_store, company.id)
    # Generate risks from the recent already-stored news so the dashboard is
    # populated immediately, instead of waiting for the next fresh article.
    background_tasks.add_task(_seed_risks_from_recent_news, company.id, force=True)

    return CompanyResponse.model_validate(company)


@router.post("/rebuild", response_model=CompanyResponse)
def rebuild_company(
    payload: OnboardingRequest,
    background_tasks: BackgroundTasks,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> CompanyResponse:
    """Update the company profile and REBUILD its Digital Twin from scratch.

    The "update my company data" action: it saves the edited profile, clears the
    current twin + risks + actions, rebuilds a fresh twin from the new profile,
    and re-creates the Neo4j knowledge graph. No synthetic risks are seeded —
    risks come only from real scraped news.
    """
    companies = CompanyRepository(session)
    company = companies.get(company_id)
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")

    company.name = payload.company_name
    company.industry = payload.industry
    company.countries = payload.countries
    company.risk_tolerance = payload.risk_tolerance
    company.primary_products = payload.primary_products
    company = companies.update(company)

    _rebuild_twin(session, company)

    # Re-index RAG and re-create the Neo4j graph (best-effort, off the request).
    background_tasks.add_task(get_company_rag().reindex, company.id)
    background_tasks.add_task(_sync_graph_store, company.id)
    # Populate risks from the recent stored news for the NEW profile immediately.
    background_tasks.add_task(_seed_risks_from_recent_news, company.id, force=True)

    return CompanyResponse.model_validate(company)


@router.get("", response_model=CompanyResponse)
def get_company(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> CompanyResponse:
    company = CompanyRepository(session).get(company_id)
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    return CompanyResponse.model_validate(company)


@router.post("/twin/upload")
async def upload_twin_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Ingest a CSV of supply-chain nodes to build the Digital Twin.

    Expected columns (header row, case-insensitive): key,type,name,country.
    A tolerant parser — unknown types are skipped and reported.
    """
    raw = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(raw))
    twin = TwinRepository(session)
    created, skipped = 0, 0
    # Optional numeric attribute columns understood by the risk engine.
    numeric_attrs = (
        "dependency_share", "lead_time_days", "reliability", "risk", "alt_suppliers",
        "inventory", "safety_stock", "coverage_days", "monthly_revenue", "margin",
    )
    for row in reader:
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        try:
            node_type = NodeType(row.get("type", "").lower())
        except ValueError:
            skipped += 1
            continue
        key = row.get("key") or row.get("name", "").lower().replace(" ", "_")
        if not key or twin.node_by_key(company_id, key):
            skipped += 1
            continue

        attributes: dict = {}
        for col in numeric_attrs:
            if row.get(col):
                try:
                    attributes[col] = float(row[col]) if "." in row[col] else int(row[col])
                except ValueError:
                    pass
        twin.add_node(
            Node(company_id=company_id, key=key, type=node_type,
                 name=row.get("name", key), country=row.get("country", ""),
                 attributes=attributes)
        )
        created += 1

    # Auto-wire edges by node-type convention so the uploaded twin is connected.
    edges_made = TwinBuilder(session).autowire_edges(company_id)

    # Uploading real data lifts the data-quality score.
    company = CompanyRepository(session).get(company_id)
    company.data_quality_score = min(99, max(company.data_quality_score, 80) + created)
    CompanyRepository(session).update(company)

    # Re-index the enriched twin for RAG (best-effort, off the request path).
    background_tasks.add_task(get_company_rag().reindex, company_id)
    # Mirror the enriched twin into the Neo4j knowledge graph (no-op if unset).
    background_tasks.add_task(_sync_graph_store, company_id)

    return {"created": created, "skipped": skipped, "edges_created": edges_made,
            "data_quality_score": company.data_quality_score}


@router.get("/risk-diagnostics")
def risk_diagnostics(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Read-only trace of why recent news is / isn't becoming risks.

    Runs the SAME pipeline gates (verifier → relevance → match) over the recent
    stored-news window and reports where each item stops — so a live, empty
    dashboard can be diagnosed exactly (which gate, with reasons), using the
    same AI provider as production. Creates nothing.
    """
    from app.repositories import NewsRepository
    from app.services.agents.relevance import RelevanceAgent, build_profile
    from app.services.agents.verifier import VerifierAgent
    from app.services.ai.adapter import ai_client
    from app.services.event_extraction import EventExtractionService
    from app.services.matching import MatchingService

    company = CompanyRepository(session).get(company_id)
    twin_repo = TwinRepository(session)
    graph = DigitalTwinService(twin_repo).build_graph(company_id)
    profile = build_profile(graph, (company.countries if company else "") or "")

    ver, rel, ex, m = (
        VerifierAgent(), RelevanceAgent(), EventExtractionService(), MatchingService(),
    )
    news = NewsRepository(session).latest(40)
    breakdown = {"verifier": 0, "relevance": 0, "match": 0, "would_risk": 0}
    samples: list[dict] = []
    for n in news:
        v = ver.verify(n)
        if not v.reliable:
            stage, reason = "verifier", v.reason
        else:
            r = rel.assess(n, profile)
            if not r.relevant:
                stage, reason = "relevance", r.reason
            else:
                ev = ex.extract(n)
                mt = m.match(ev, graph)
                if mt is None:
                    stage, reason = "match", f"no supplier for country={ev.country!r}"
                else:
                    stage, reason = "would_risk", f"matches {mt.supplier.name}"
        breakdown[stage] += 1
        if len(samples) < 15:
            samples.append({"title": n.title[:90], "stage": stage, "reason": str(reason)[:140]})

    return {
        "company": company.name if company else None,
        "countries": company.countries if company else None,
        "asset_countries": profile.get("asset_countries", []),
        "twin_nodes": len(graph.nodes),
        "ai_provider": ai_client.provider,
        "ai_live": ai_client.live,
        "news_window": len(news),
        "existing_risks": len(RiskRepository(session).for_company(company_id)),
        "breakdown": breakdown,
        "samples": samples,
    }


@router.get("/twin/graph")
def twin_graph(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    return DigitalTwinService(TwinRepository(session)).graph_payload(company_id)


@router.get("/twin/paths")
def twin_dependency_paths(
    start: str | None = None,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Supply-chain dependency-path mapping downstream of a node.

    Given a starting entity ``start`` (e.g. a disrupted supplier's key), returns
    every downstream dependency path to the customers/leaf nodes it feeds —
    computed in Neo4j (Cypher) when the knowledge graph is configured, with an
    in-memory graph-traversal fallback otherwise. If ``start`` is omitted, the
    first supplier in the twin is used so the endpoint is self-demonstrating.
    """
    twin_repo = TwinRepository(session)
    service = DigitalTwinService(twin_repo)

    if not start:
        suppliers = [n for n in twin_repo.nodes(company_id) if n.type == NodeType.SUPPLIER]
        if not suppliers:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No supplier nodes in twin")
        start = suppliers[0].key

    return service.dependency_paths(company_id, start)


def _rebuild_twin(session: Session, company: Company) -> None:
    """Clear a company's derived data and rebuild its twin from the profile.

    Deletes in FK-safe order (Postgres enforces foreign keys): feedback
    (→ actions) and email drafts (→ risks), then actions, risks, and the twin —
    then bootstraps a fresh twin from the current profile. No synthetic starter
    risks are seeded; risks come only from real scraped news via the pipeline.
    """
    cid = company.id
    FeedbackRepository(session).clear(cid)
    EmailDraftRepository(session).clear(cid)
    ActionRepository(session).clear(cid)
    RiskRepository(session).clear(cid)
    TwinRepository(session).clear(cid)
    TwinBuilder(session).bootstrap_from_profile(company)


def _sync_graph_store(company_id: int) -> None:
    """Background task: mirror a company's twin into Neo4j (best-effort)."""
    from app.db.session import session_scope

    with session_scope() as session:
        DigitalTwinService(TwinRepository(session)).sync_to_graph_store(company_id)


# Debounce map so the dashboard (which polls every ~10s) can safely trigger
# seeding without re-running the pipeline over the window every few seconds.
_last_seed: dict[int, float] = {}


def _seed_risks_from_recent_news(company_id: int, force: bool = False) -> None:
    """Background task: run the risk pipeline over recent ALREADY-STORED news.

    The poller only processes items as they're first scraped, so news stored
    before a profile/country change never gets re-evaluated. Re-run the
    (heuristic-gated, de-duped) pipeline over the recent news window so relevant,
    matching stories surface as risks right away. ``force`` bypasses the debounce
    (used after onboarding/rebuild); otherwise it runs at most once per 90s per
    company (used by the auto-trigger on an empty dashboard).
    """
    import time

    from app.db.session import session_scope
    from app.repositories import CompanyRepository, NewsRepository
    from app.services import news_poller

    now = time.monotonic()
    if not force and now - _last_seed.get(company_id, 0.0) < 90.0:
        return
    _last_seed[company_id] = now

    with session_scope() as session:
        company = CompanyRepository(session).get(company_id)
        if company is None:
            return
        countries = company.countries or ""
        # Scan a wide window so supply-chain disruption stories aren't pushed out
        # by the higher volume of general world/business news at the top.
        item_ids = [n.id for n in NewsRepository(session).latest(200)]
    if item_ids:
        try:
            news_poller._process_company(company_id, countries, item_ids)
        except Exception:  # noqa: BLE001 — best-effort seeding, never fail the request
            pass
