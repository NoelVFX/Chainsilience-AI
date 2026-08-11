"""Database entities.

The schema models a company's supply chain as a graph (``Node`` + ``Edge`` =
the Digital Twin) plus the intelligence pipeline artefacts (news, extracted
events, scored risks) and the human workflow (actions, feedback).

JSON columns are used for open-ended, read-mostly metadata (node attributes,
risk factor breakdowns, impact predictions) — pragmatic for an MVP while
keeping the relational spine strongly typed.

Note: this module deliberately avoids ``from __future__ import annotations`` —
SQLModel/SQLAlchemy must evaluate ``Relationship`` annotations at mapper-init
time, which stringified annotations break.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------
class UserRole(str, Enum):
    ADMINISTRATOR = "administrator"
    MANAGER = "manager"
    ANALYST = "analyst"
    VIEWER = "viewer"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ActionStatus(str, Enum):
    RECOMMENDED = "recommended"
    APPROVED = "approved"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class NodeType(str, Enum):
    SUPPLIER = "supplier"
    FACTORY = "factory"
    WAREHOUSE = "warehouse"
    PORT = "port"
    PRODUCT = "product"
    COMPONENT = "component"
    CUSTOMER = "customer"
    ROUTE = "route"


class EdgeType(str, Enum):
    SUPPLIES = "supplies"
    PRODUCES = "produces"
    SHIPS = "ships"
    STORES = "stores"
    REQUIRES = "requires"
    DELIVERS = "delivers"


# ---------------------------------------------------------------------------
# Core tables
# ---------------------------------------------------------------------------
class Company(SQLModel, table=True):
    __tablename__ = "companies"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    industry: str = "Semiconductors"
    countries: str = ""  # comma-separated for MVP
    risk_tolerance: str = "Balanced"
    primary_products: str = ""
    data_quality_score: int = 0
    created_at: datetime = Field(default_factory=_utcnow)

    users: list["User"] = Relationship(back_populates="company")
    nodes: list["Node"] = Relationship(back_populates="company")


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    full_name: str = ""
    hashed_password: str
    role: UserRole = Field(default=UserRole.MANAGER)
    is_active: bool = True
    company_id: Optional[int] = Field(default=None, foreign_key="companies.id")
    created_at: datetime = Field(default_factory=_utcnow)

    company: Optional[Company] = Relationship(back_populates="users")


class EmailOtp(SQLModel, table=True):
    """A one-time verification code emailed during sign-up.

    The code itself is never stored — only an HMAC hash. A short expiry plus an
    attempt counter bound brute-force. Marked ``verified`` once the correct code
    is entered, which is what gates account registration.
    """

    __tablename__ = "email_otps"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True)
    code_hash: str
    expires_at: datetime
    attempts: int = 0
    verified: bool = False
    created_at: datetime = Field(default_factory=_utcnow)


class PasswordResetToken(SQLModel, table=True):
    """A single-use password-reset token, emailed as a link.

    Only the token's HMAC hash is stored. Short expiry; consumed (deleted) on a
    successful reset and superseded whenever a new reset is requested.
    """

    __tablename__ = "password_reset_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(index=True)
    expires_at: datetime
    created_at: datetime = Field(default_factory=_utcnow)


class Node(SQLModel, table=True):
    """A Digital Twin node (supplier, factory, product, ...)."""

    __tablename__ = "twin_nodes"

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="companies.id", index=True)
    key: str = Field(index=True)  # stable slug, unique within company
    type: NodeType
    name: str
    location: str = ""
    country: str = ""
    # lead_time, risk, capacity, reliability, cost, inventory,
    # safety_stock, coverage_days, dependency_share ...
    attributes: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    company: Optional[Company] = Relationship(back_populates="nodes")


class Edge(SQLModel, table=True):
    """A directed relationship between two Digital Twin nodes."""

    __tablename__ = "twin_edges"

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="companies.id", index=True)
    source_key: str = Field(index=True)
    target_key: str = Field(index=True)
    type: EdgeType


class NewsItem(SQLModel, table=True):
    __tablename__ = "news_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    source: str
    title: str
    url: str = ""
    body: str = ""
    published_at: datetime = Field(default_factory=_utcnow)
    ingested_at: datetime = Field(default_factory=_utcnow)


class Event(SQLModel, table=True):
    """A structured disruption event extracted from a news item."""

    __tablename__ = "events"

    id: Optional[int] = Field(default=None, primary_key=True)
    news_id: Optional[int] = Field(default=None, foreign_key="news_items.id")
    type: str  # earthquake, export_restriction, port_congestion, strike, ...
    location: str = ""
    country: str = ""
    companies: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    industries: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    products: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    duration_days: int = 0
    severity: Severity = Severity.MEDIUM
    confidence: float = 0.7
    summary: str = ""
    created_at: datetime = Field(default_factory=_utcnow)


class Risk(SQLModel, table=True):
    """An event matched to a company and scored by the risk engine."""

    __tablename__ = "risks"

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="companies.id", index=True)
    event_id: Optional[int] = Field(default=None, foreign_key="events.id")
    title: str
    headline: str = ""
    supplier: str = ""
    severity: Severity = Severity.MEDIUM
    score: int = 0
    confidence: float = 0.7
    reasoning: str = ""
    revenue_at_risk: float = 0.0
    # [{label, value}] score contributions, 0-100
    factors: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    # [{label, value}] predicted impact tiles
    impact: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    # ordered strings — cascade from trigger to revenue
    chain: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    # Persisted mitigation scenarios (generated once, refreshed on demand) so the
    # option set is stable across requests/priority changes and only regenerates
    # when explicitly refreshed. [{id,name,risk_reduction,cost,recovery,financial,...}]
    scenarios: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    # Completed action IDs whose mitigation effects have been applied. This makes
    # action completion idempotent and lets legacy completed actions be repaired
    # once without reducing score/revenue a second time.
    mitigation_action_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_utcnow)


class Action(SQLModel, table=True):
    """A mitigation action tracked through the Action Center workflow."""

    __tablename__ = "actions"

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="companies.id", index=True)
    risk_id: Optional[int] = Field(default=None, foreign_key="risks.id")
    title: str
    owner: str = ""
    deadline: str = ""
    priority: Severity = Severity.MEDIUM
    status: ActionStatus = ActionStatus.RECOMMENDED
    estimated_benefit: str = ""
    estimated_cost: str = ""
    department: str = ""
    created_at: datetime = Field(default_factory=_utcnow)


class EmailDraft(SQLModel, table=True):
    """A saved, user-editable mitigation email draft (per risk + kind)."""

    __tablename__ = "email_drafts"

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="companies.id", index=True)
    risk_id: int = Field(foreign_key="risks.id", index=True)
    kind: str = "customer"  # customer | supplier | executive | procurement
    subject: str = ""
    body: str = ""
    updated_at: datetime = Field(default_factory=_utcnow)


class Feedback(SQLModel, table=True):
    """User rating of a recommendation, feeding the improvement loop."""

    __tablename__ = "feedback"

    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="companies.id", index=True)
    action_id: Optional[int] = Field(default=None, foreign_key="actions.id")
    rating: int = 0  # 1-5
    comment: str = ""
    created_at: datetime = Field(default_factory=_utcnow)
