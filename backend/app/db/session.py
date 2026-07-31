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


def init_db() -> None:
    """Create all tables. Import models for side-effect registration first."""
    from app import models  # noqa: F401  (register SQLModel metadata)

    logger.info("Creating database schema (%s)", engine.url.get_backend_name())
    SQLModel.metadata.create_all(engine)
    # Backfill columns added to already-existing tables.
    _ensure_column("risks", "scenarios")
    _ensure_column("risks", "mitigation_action_ids")


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped database session."""
    with Session(engine) as session:
        yield session
