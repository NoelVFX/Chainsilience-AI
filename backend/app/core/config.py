"""Application configuration.

Centralised, strongly-typed settings loaded from environment variables (12-factor).
A single ``settings`` instance is imported across the app (dependency injection
friendly — swap it in tests by overriding the ``get_settings`` provider).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the ChainSight AI API."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Meta -----------------------------------------------------------------
    app_name: str = "ChainSight AI"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    # --- Security -------------------------------------------------------------
    # Override in production via SECRET_KEY env var.
    secret_key: str = "dev-insecure-change-me-in-production-00000000000000000000"
    access_token_expire_minutes: int = 60 * 24  # 1 day
    jwt_algorithm: str = "HS256"

    # --- Persistence ----------------------------------------------------------
    # Defaults to a local SQLite file so the app runs with zero infrastructure.
    # In Docker this is overridden to a Postgres DSN.
    database_url: str = "sqlite:///./chainsight.db"
    seed_on_startup: bool = True

    # --- CORS -----------------------------------------------------------------
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # --- AI -------------------------------------------------------------------
    # When unset, the AI layer uses a deterministic, offline fallback so the
    # full workflow demos without any external API keys or network access.
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (FastAPI dependency)."""
    return Settings()


settings = get_settings()
