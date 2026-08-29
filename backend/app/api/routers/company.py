"""Company onboarding + Digital Twin endpoints."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlmodel import Session

from app.api.deps import get_current_company_id, get_current_user
from app.db.session import get_session
from app.models.entities import Company, Node, NodeType, User
from app.repositories import CompanyRepository, TwinRepository, UserRepository
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
    profile and seeded with a couple of starter risks (via the real pipeline) so
    the dashboard is immediately populated rather than empty.
    """
    companies = CompanyRepository(session)
    if user.company_id:
        company = companies.get(user.company_id)
        company.name = payload.company_name
    else:
        company = Company(name=payload.company_name)

    company.industry = payload.industry
    company.countries = payload.countries
    company.risk_tolerance = payload.risk_tolerance
    company.primary_products = payload.primary_products
    company.data_quality_score = company.data_quality_score or 60
    company = companies.update(company)

    if not user.company_id:
        user.company_id = company.id
        UserRepository(session).add(user)

    # Build a starter twin + risks if this company has no twin yet.
    builder = TwinBuilder(session)
    if builder.bootstrap_from_profile(company):
        builder.seed_starter_risks(company)

    # Index the freshly-built company data for RAG (best-effort, off the request).
    background_tasks.add_task(get_company_rag().reindex, company.id)
    # Mirror the twin into the Neo4j knowledge graph (no-op if not configured).
    background_tasks.add_task(_sync_graph_store, company.id)

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


def _sync_graph_store(company_id: int) -> None:
    """Background task: mirror a company's twin into Neo4j (best-effort)."""
    from app.db.session import session_scope

    with session_scope() as session:
        DigitalTwinService(TwinRepository(session)).sync_to_graph_store(company_id)
