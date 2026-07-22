"""Concrete repositories over the SQLModel session.

Each repository owns queries for a single aggregate. They accept a ``Session``
in the constructor (constructor injection) so a request-scoped session flows in
from the FastAPI dependency.
"""
from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from app.models.entities import (
    Action,
    ActionStatus,
    Company,
    Edge,
    EmailDraft,
    Event,
    Feedback,
    NewsItem,
    Node,
    Risk,
    User,
)


class UserRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, user_id: int) -> User | None:
        return self.session.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.session.exec(select(User).where(User.email == email)).first()

    def add(self, user: User) -> User:
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user


class CompanyRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, company_id: int) -> Company | None:
        return self.session.get(Company, company_id)

    def add(self, company: Company) -> Company:
        self.session.add(company)
        self.session.commit()
        self.session.refresh(company)
        return company

    def update(self, company: Company) -> Company:
        self.session.add(company)
        self.session.commit()
        self.session.refresh(company)
        return company


class TwinRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def nodes(self, company_id: int) -> list[Node]:
        return list(
            self.session.exec(select(Node).where(Node.company_id == company_id)).all()
        )

    def edges(self, company_id: int) -> list[Edge]:
        return list(
            self.session.exec(select(Edge).where(Edge.company_id == company_id)).all()
        )

    def node_by_key(self, company_id: int, key: str) -> Node | None:
        return self.session.exec(
            select(Node).where(Node.company_id == company_id, Node.key == key)
        ).first()

    def add_node(self, node: Node) -> Node:
        self.session.add(node)
        self.session.commit()
        self.session.refresh(node)
        return node

    def add_edge(self, edge: Edge) -> Edge:
        self.session.add(edge)
        self.session.commit()
        self.session.refresh(edge)
        return edge


class NewsRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def latest(self, limit: int = 20) -> list[NewsItem]:
        return list(
            self.session.exec(
                select(NewsItem).order_by(NewsItem.published_at.desc()).limit(limit)
            ).all()
        )

    def add(self, item: NewsItem) -> NewsItem:
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return item


class EventRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, event: Event) -> Event:
        self.session.add(event)
        self.session.commit()
        self.session.refresh(event)
        return event

    def get(self, event_id: int) -> Event | None:
        return self.session.get(Event, event_id)


class RiskRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def for_company(self, company_id: int) -> list[Risk]:
        return list(
            self.session.exec(
                select(Risk)
                .where(Risk.company_id == company_id)
                .order_by(Risk.score.desc())
            ).all()
        )

    def get(self, risk_id: int) -> Risk | None:
        return self.session.get(Risk, risk_id)

    def add(self, risk: Risk) -> Risk:
        self.session.add(risk)
        self.session.commit()
        self.session.refresh(risk)
        return risk


class ActionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def for_company(self, company_id: int) -> list[Action]:
        return list(
            self.session.exec(
                select(Action)
                .where(Action.company_id == company_id)
                .order_by(Action.created_at.asc())
            ).all()
        )

    def get(self, action_id: int) -> Action | None:
        return self.session.get(Action, action_id)

    def exists_title(self, company_id: int, title: str) -> bool:
        """True if an action with this title already exists for the company."""
        return self.session.exec(
            select(Action.id).where(
                Action.company_id == company_id, Action.title == title
            )
        ).first() is not None

    def add(self, action: Action) -> Action:
        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)
        return action

    def add_unique(self, action: Action) -> Action | None:
        """Add an action only if no same-title action exists (dedupe)."""
        if self.exists_title(action.company_id, action.title):
            return None
        return self.add(action)

    def update_status(self, action: Action, status: ActionStatus) -> Action:
        action.status = status
        self.session.add(action)
        self.session.commit()
        self.session.refresh(action)
        return action

    def delete(self, action: Action) -> None:
        self.session.delete(action)
        self.session.commit()


class EmailDraftRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, company_id: int, risk_id: int, kind: str) -> EmailDraft | None:
        return self.session.exec(
            select(EmailDraft).where(
                EmailDraft.company_id == company_id,
                EmailDraft.risk_id == risk_id,
                EmailDraft.kind == kind,
            )
        ).first()

    def upsert(self, company_id: int, risk_id: int, kind: str, subject: str, body: str) -> EmailDraft:
        from app.models.entities import _utcnow

        draft = self.get(company_id, risk_id, kind)
        if draft is None:
            draft = EmailDraft(company_id=company_id, risk_id=risk_id, kind=kind)
        draft.subject = subject
        draft.body = body
        draft.updated_at = _utcnow()
        self.session.add(draft)
        self.session.commit()
        self.session.refresh(draft)
        return draft


class FeedbackRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, feedback: Feedback) -> Feedback:
        self.session.add(feedback)
        self.session.commit()
        self.session.refresh(feedback)
        return feedback
