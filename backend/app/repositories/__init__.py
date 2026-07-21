"""Data-access layer (Repository Pattern).

Repositories are the only place that talks to the ORM session, keeping services
persistence-agnostic and testable.
"""
from app.repositories.repos import (  # noqa: F401
    ActionRepository,
    CompanyRepository,
    EmailDraftRepository,
    EventRepository,
    FeedbackRepository,
    NewsRepository,
    RiskRepository,
    TwinRepository,
    UserRepository,
)

__all__ = [
    "ActionRepository",
    "CompanyRepository",
    "EmailDraftRepository",
    "EventRepository",
    "FeedbackRepository",
    "NewsRepository",
    "RiskRepository",
    "TwinRepository",
    "UserRepository",
]
