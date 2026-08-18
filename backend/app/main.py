"""FastAPI application entrypoint for ChainSight AI.

Wires configuration, logging, database initialisation + demo seeding, CORS, and
the versioned API routers. Run locally with:

    uvicorn app.main:app --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.core.config import settings
from app.core.logging import get_logger
from app.db.seed import seed_if_empty
from app.db.session import engine, init_db
from app.api.routers import (
    actions,
    auth,
    billing,
    company,
    dashboard,
    feedback,
    news,
    rag,
    reports,
    risks,
    scenarios,
)

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create schema, seed demo data, warm the AI + RAG stack."""
    logger.info("Starting %s (env=%s)", settings.app_name, settings.environment)
    init_db()
    if settings.seed_on_startup:
        with Session(engine) as session:
            seed_if_empty(session)

    # Warm up the AI client and check the company-RAG stack availability. The
    # RAG index itself is built per company on demand (onboarding / upload /
    # ingest), so there is nothing to bulk-ingest here.
    try:
        from app.services.ai.adapter import ai_client
        from app.services.rag_company import get_company_rag

        _ = ai_client.live
        rag_ok = get_company_rag().available()
        logger.info("Warmup complete — AI live=%s, company RAG available=%s", ai_client.live, rag_ok)
    except Exception as e:  # noqa: BLE001
        logger.warning("Startup warmup failed: %s", e)

    yield
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="AI-powered supply chain risk intelligence platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["meta"])
def health() -> dict:
    """Liveness probe + which AI provider/model is active."""
    from app.services.ai.adapter import ai_client

    return {
        "status": "ok",
        "app": settings.app_name,
        "ai_live": ai_client.live,
        "ai_provider": ai_client.provider,
        "ai_model": ai_client.model or None,
    }


@app.get("/healthz", tags=["meta"])
def healthz() -> dict:
    """Lightweight liveness probe for Render health checks (no ML imports)."""
    return {"status": "ok"}


@app.get("/debug/rag", tags=["debug"])
def debug_rag() -> dict:
    """Whether the company-RAG stack (LangChain + embeddings + FAISS) is available."""
    from app.services.rag_company import EMBED_MODEL, get_company_rag

    return {"available": get_company_rag().available(), "embed_model": EMBED_MODEL}


@app.get("/debug/scenario/{risk_id}", tags=["debug"])
def debug_scenario(risk_id: int) -> dict:
    """Debug scenario generation for a specific risk."""
    from app.db.session import get_session
    from app.repositories import RiskRepository, TwinRepository
    from app.services.scenario import ScenarioService
    
    with next(get_session()) as session:
        risk = RiskRepository(session).get(risk_id)
        if not risk:
            return {"error": "Risk not found"}
        
        twin_repo = TwinRepository(session)
        scenario_service = ScenarioService()
        scenarios = scenario_service.simulate(
            risk,
            twin_nodes=twin_repo.nodes(risk.company_id),
            twin_edges=twin_repo.edges(risk.company_id),
        )
        
        return {
            "risk_id": risk_id,
            "event_type": scenario_service._infer_event_type(risk),
            "scenarios": scenarios,
            "source": scenarios[0]["source"] if scenarios else "none",
        }


# --- Versioned API ----------------------------------------------------------
_prefix = settings.api_v1_prefix

# The platform is free to use once a user has signed in and completed onboarding
# — there is NO payment wall. Stripe (the Growth plan) is an optional upgrade
# handled entirely by the billing router; it never gates platform access.
for module in (
    auth, company, billing, dashboard, risks, scenarios, actions, news,
    feedback, reports, rag,
):
    app.include_router(module.router, prefix=_prefix)