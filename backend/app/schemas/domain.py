"""Response/request schemas for the domain resources.

These decouple the API contract from the ORM entities and shape data to match
exactly what the frontend screens render (KPIs, risk cards, scenario tiles, ...).
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.models.entities import ActionStatus, Severity


# --- Company / onboarding ----------------------------------------------------
class OnboardingRequest(BaseModel):
    company_name: str
    industry: str = "Semiconductors"
    countries: str = ""
    risk_tolerance: str = "Balanced"
    primary_products: str = ""


class CompanyResponse(BaseModel):
    id: int
    name: str
    industry: str
    countries: str
    risk_tolerance: str
    primary_products: str
    data_quality_score: int

    model_config = {"from_attributes": True}


# --- Dashboard ---------------------------------------------------------------
class Kpi(BaseModel):
    label: str
    value: str
    sub: str


class RiskCard(BaseModel):
    id: int
    title: str
    supplier: str
    severity: str
    severity_color: str
    impact: str
    time: str


class NewsCard(BaseModel):
    id: int
    source: str
    title: str
    time: str
    url: str = ""


class DashboardResponse(BaseModel):
    kpis: list[Kpi]
    risks: list[RiskCard]
    news: list[NewsCard]
    actions_summary: str
    map_points: list[dict[str, Any]] = Field(default_factory=list)


# --- Risk detail -------------------------------------------------------------
class Factor(BaseModel):
    label: str
    value: int


class ImpactTile(BaseModel):
    label: str
    value: str


class RiskDetailResponse(BaseModel):
    id: int
    title: str
    headline: str
    severity: str
    severity_color: str
    score: int
    confidence: float
    time: str
    reasoning: str
    factors: list[Factor]
    impact: list[ImpactTile]
    chain: list[str]


# --- Scenario simulator ------------------------------------------------------
class ScenarioTile(BaseModel):
    id: str
    name: str
    risk_reduction: str
    cost: str
    recovery: str
    financial: str
    score: int = 0  # 0-100 multi-objective fit for the chosen priority
    rank: int = 0


class ScenarioResponse(BaseModel):
    risk_id: int
    risk_title: str
    scenarios: list[ScenarioTile]
    priority: str = "balanced"


class ApproveScenarioRequest(BaseModel):
    scenario_id: str


# --- Action center -----------------------------------------------------------
class ActionCard(BaseModel):
    id: int
    title: str
    owner: str
    deadline: str
    priority: str
    priority_color: str
    status: ActionStatus


class ActionColumn(BaseModel):
    key: ActionStatus
    name: str
    items: list[ActionCard]


class ActionBoardResponse(BaseModel):
    columns: list[ActionColumn]


class MoveActionRequest(BaseModel):
    status: ActionStatus


# --- Email generator ---------------------------------------------------------
class EmailRequest(BaseModel):
    risk_id: int
    kind: str = "customer"  # customer | supplier | executive | procurement


class EmailSaveRequest(BaseModel):
    kind: str = "customer"
    subject: str
    body: str


class EmailResponse(BaseModel):
    subject: str
    body: str
    kind: str
    saved: bool = False  # True when loaded from a saved draft (not freshly generated)


# --- Feedback ----------------------------------------------------------------
class FeedbackRequest(BaseModel):
    action_id: int
    rating: int = Field(ge=1, le=5)
    comment: str = ""
