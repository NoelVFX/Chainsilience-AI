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

# SQLite needs check_same_thread=False when used with a threaded server.
_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args=_connect_args,
    pool_pre_ping=True,
)


def init_db() -> None:
    """Create all tables. Import models for side-effect registration first."""
    from app import models  # noqa: F401  (register SQLModel metadata)

    logger.info("Creating database schema (%s)", engine.url.get_backend_name())
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped database session."""
    with Session(engine) as session:
        yield session
