"""Application configuration.

Centralised, strongly-typed settings loaded from environment variables (12-factor).
A single ``settings`` instance is imported across the app (dependency injection
friendly — swap it in tests by overriding the ``get_settings`` provider).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Chainsilience AI API."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Meta -----------------------------------------------------------------
    app_name: str = "Chainsilience AI"
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

    # Hard per-call timeout (seconds) so a slow/unreachable LLM endpoint can
    # never hang a request — the adapter falls back deterministically instead.
    ai_request_timeout: float = 45.0
    ai_max_tokens: int = 1200

    # --- Email / OTP ----------------------------------------------------------
    # Transactional email for sign-up verification codes. When SMTP is not
    # configured the mailer degrades gracefully: it logs the code server-side
    # and (outside production) returns it in the API response so the flow is
    # fully testable with zero email infrastructure.
    #
    # For real delivery set SMTP_HOST/SMTP_USER/SMTP_PASSWORD (e.g. a Gmail app
    # password, SendGrid, Mailgun, Postmark). smtp_use_tls=True uses STARTTLS on
    # port 587; set it False to use implicit SSL on port 465.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    # Sender address for verification emails. Defaults to the Chainsilience
    # mailbox; for Gmail this must match SMTP_USER (the authenticated account).
    smtp_from: str | None = "chainsilienceai@gmail.com"
    smtp_use_tls: bool = True

    # 6-digit code, valid for 10 minutes, max 5 wrong tries before re-request.
    otp_length: int = 6
    otp_ttl_seconds: int = 600
    otp_max_attempts: int = 5

    # Base URL of the frontend, used to build the password-reset link in emails.
    # Set FRONTEND_BASE_URL to the Vercel domain in production.
    frontend_base_url: str = "http://localhost:3000"
    # Password-reset links are valid for 30 minutes.
    reset_token_ttl_seconds: int = 1800

    # --- Billing / Stripe -----------------------------------------------------
    # Gate the platform behind a paid plan via Stripe Checkout. Degrades
    # gracefully: with no STRIPE_SECRET_KEY the gate is INACTIVE (the app runs
    # exactly as before and checkout links can't be created). The demo account
    # is always exempt so the public demo stays free.
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    # The platform is free after onboarding; the Growth plan is an optional
    # upgrade. Left False so nothing gates platform access. (The gate machinery
    # in deps.require_entitlement remains available but is no longer wired in.)
    require_payment: bool = False
    # Growth plan price (inline price_data, so no pre-created Stripe Price IDs).
    stripe_currency: str = "usd"
    stripe_growth_price_cents: int = 49900  # $499 / month
    # The seeded demo account — always entitled, never gated.
    demo_email: str = "demo@chainsight.ai"

    # --- News scraping --------------------------------------------------------
    # Curated public RSS feeds for supply-chain / trade / logistics / disaster
    # signals. Fetched live on demand; falls back to an offline sample when the
    # network is unavailable.
    # A diverse mix: major world/business outlets (SCMP, BBC, CNN, The Economist,
    # Al Jazeera, Guardian, NYT, Reuters, FT) plus trade/logistics specialists.
    # The relevance agent filters each item to the company's supply-chain paths,
    # so broad outlets are fine — irrelevant stories are dropped.
    news_rss_feeds: list[str] = [
        # Global / business news
        "https://www.scmp.com/rss/91/feed",                       # SCMP – Asia
        "https://feeds.bbci.co.uk/news/world/rss.xml",            # BBC World
        "https://feeds.bbci.co.uk/news/business/rss.xml",         # BBC Business
        "http://rss.cnn.com/rss/edition_world.rss",               # CNN World
        "http://rss.cnn.com/rss/money_news_international.rss",     # CNN Business
        "https://www.economist.com/finance-and-economics/rss.xml",  # The Economist
        "https://www.aljazeera.com/xml/rss/all.xml",              # Al Jazeera
        "https://www.theguardian.com/business/rss",               # Guardian Business
        "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",  # NYT Business
        "https://feeds.reuters.com/reuters/businessNews",         # Reuters Business
        "https://www.ft.com/rss/home",                            # Financial Times
        "https://apnews.com/hub/business?output=rss",             # AP Business
        # Supply-chain / trade / logistics specialists
        "https://gcaptain.com/feed/",
        "https://www.freightwaves.com/feed",
        "https://splash247.com/feed/",
        "https://www.supplychaindive.com/feeds/news/",
    ]
    news_fetch_per_feed: int = 4
    news_http_timeout: float = 8.0
    news_max_age_days: int = 7

    # --- Real-time news poller ------------------------------------------------
    # A background loop scrapes the feeds concurrently every `poll_seconds` and
    # keeps the dashboard fresh. It de-dupes against the DB, and (when enabled)
    # runs the risk pipeline for newly-relevant items per company. Disable the
    # whole loop, or just the LLM risk-generation, to control cost.
    news_poll_enabled: bool = True
    news_poll_seconds: int = 60
    news_poll_generate_risks: bool = True
    news_poll_max_new_risks: int = 8  # per company per cycle (bounds LLM calls)

    # --- Neo4j knowledge graph (OPTIONAL) -------------------------------------
    # When configured, the company's supply-chain entities + relationships are
    # mirrored into Neo4j for real graph storage and Cypher dependency-path
    # mapping. Unset → the relational twin + in-memory traversal remain the
    # source of truth (unchanged behaviour). Use a Neo4j Aura connection URI
    # (neo4j+s://...) in production, or bolt://localhost:7687 locally.
    neo4j_uri: str | None = None
    neo4j_user: str = "neo4j"
    neo4j_password: str | None = None
    neo4j_database: str = "neo4j"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (FastAPI dependency)."""
    return Settings()


settings = get_settings()
