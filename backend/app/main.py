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
    """Liveness probe + whether the live LLM path is active."""
    from app.services.ai.adapter import ai_client

    return {"status": "ok", "app": settings.app_name, "ai_live": ai_client.live}


# --- Versioned API ----------------------------------------------------------
_prefix = settings.api_v1_prefix
for module in (auth, company, dashboard, risks, scenarios, actions, news, feedback, reports):
    app.include_router(module.router, prefix=_prefix)
