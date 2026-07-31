"""Database engine and session management.

A single synchronous SQLAlchemy engine backs the app. SQLite is the zero-config
default; a Postgres DSN (used in Docker) is picked up transparently from
``DATABASE_URL``. FastAPI endpoints receive a session via the ``get_session``
dependency, guaranteeing the session is closed after each request.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _normalize_db_url(url: str) -> str:
    """Normalise managed-Postgres URLs to the psycopg3 driver.

    Render/Railway/Heroku hand out ``postgres://`` (and sometimes
    ``postgresql://``) DSNs, but SQLAlchemy 2.x needs an explicit driver.
    """
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


DATABASE_URL = _normalize_db_url(settings.database_url)

# SQLite needs check_same_thread=False when used with a threaded server.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=_connect_args,
    pool_pre_ping=True,
)


def _ensure_column(table: str, column: str) -> None:
    """Idempotently add a JSON column to an existing table (lightweight migration)."""
    from sqlalchemy import inspect, text

    try:
        existing = {c["name"] for c in inspect(engine).get_columns(table)}
    except Exception:  # table not created yet — create_all handles it
        return
    if column in existing:
        return
    col_type = "JSON" if engine.url.get_backend_name().startswith("postgres") else "TEXT"
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
    logger.info("Migrated: added %s.%s (%s)", table, column, col_type)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup: create schema, seed demo data, ingest knowledge base."""
    logger.info("Starting ChainSight AI (env=%s)", settings.environment)
    init_db()
    if settings.seed_on_startup:
        with Session(engine) as session:
            seed_if_empty(session)

    # Warm up RAG + AI on startup
    try:
        from app.services.rag import get_rag_service
        from app.services.ai.adapter import ai_client
        rag = get_rag_service()
        rag.initialize()

        # Auto-ingest knowledge base if empty
        if len(rag.chunks) == 0:
            from pathlib import Path
            knowledge_dir = Path("/app/knowledge")
            exts = {".pdf", ".docx", ".md", ".txt"}
            paths = [p for p in knowledge_dir.rglob("*") if p.suffix.lower() in exts and p.is_file()]
            if paths:
                rag.add_documents(paths)
                logger.info("Auto-ingested %d knowledge documents on startup", len(paths))

        # Warm up AI client
        _ = ai_client.live
        logger.info("RAG + AI warmup complete")
    except Exception as e:
        logger.warning("Startup warmup failed: %s", e)

    yield
    logger.info("Shutting down ChainSight AI")


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
