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
    # Provider auto-selection at runtime: NVIDIA (Nemotron) > OpenAI > offline
    # deterministic fallback. When no key is set, every AI module still works via
    # rule-based fallbacks so the platform runs with zero external dependencies.
    #
    # NVIDIA Nemotron is called through its OpenAI-compatible endpoint. Set
    # NVIDIA_API_KEY (and optionally NVIDIA_MODEL) to activate the live agents.
    nvidia_api_key: str | None = None
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    # Exact model id from build.nvidia.com (the Llama-Nemotron "Ultra" tier).
    nvidia_model: str = "nvidia/llama-3.1-nemotron-ultra-253b-v1"

    # OpenAI (fallback provider if NVIDIA not configured).
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    # --- News scraping --------------------------------------------------------
    # Curated public RSS feeds for supply-chain / trade / logistics / disaster
    # signals. Fetched live on demand; falls back to an offline sample when the
    # network is unavailable.
    news_rss_feeds: list[str] = [
        "https://feeds.reuters.com/reuters/businessNews",
        "https://www.ft.com/rss/home",
        "https://gcaptain.com/feed/",
        "https://www.freightwaves.com/feed",
        "https://splash247.com/feed/",
        "https://www.supplychaindive.com/feeds/news/",
        "https://feeds.bbci.co.uk/news/business/rss.xml",
    ]
    news_fetch_per_feed: int = 6
    news_http_timeout: float = 8.0


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (FastAPI dependency)."""
    return Settings()


settings = get_settings()
