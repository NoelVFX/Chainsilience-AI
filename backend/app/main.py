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
    """Startup: create schema and seed the demo dataset."""
    logger.info("Starting %s (env=%s)", settings.app_name, settings.environment)
    init_db()
    if settings.seed_on_startup:
        with Session(engine) as session:
            seed_if_empty(session)
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
    """Debug RAG status without auth."""
    from app.services.rag import get_rag_service
    rag = get_rag_service()
    rag.initialize()
    return {
        "chunks": len(rag.chunks),
        "indexed": rag.index is not None,
        "sources": list(set(c.source for c in rag.chunks)),
        "source_types": list(set(c.source_type for c in rag.chunks)),
        "persist_dir": str(rag.persist_dir),
    }


@app.post("/debug/rag/ingest", tags=["debug"])
def debug_rag_ingest() -> dict:
    """Manually trigger RAG ingestion without auth."""
    from app.services.rag import get_rag_service
    rag = get_rag_service()
    rag.initialize()
    
    # Scan knowledge directory
    from pathlib import Path
    knowledge_dir = Path("/app/knowledge")
    exts = {".pdf", ".docx", ".md", ".txt"}
    paths = [p for p in knowledge_dir.rglob("*") if p.suffix.lower() in exts and p.is_file()]
    
    files = [str(p.relative_to(knowledge_dir)) for p in paths if p.exists()]
    count = rag.add_documents(paths)
    return {"ingested": count, "files": files}


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
for module in (auth, company, dashboard, risks, scenarios, actions, news, feedback, reports, rag):
    app.include_router(module.router, prefix=_prefix)