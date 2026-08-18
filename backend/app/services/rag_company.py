"""Company-scoped RAG on LangChain.

Builds a per-company retrieval corpus from the onboarded company's **own data in
the database** — its Digital Twin (nodes + edges), scored risks, the events that
triggered them, and mitigation actions — embeds it into a per-company FAISS
store, and serves grounding context to the scenario generator. Retrieval is
strictly scoped: each company has its own index, so one company's data can never
leak into another's prompts.

LangChain stack:
- ``langchain_huggingface.HuggingFaceEmbeddings`` — sentence-transformers
  ``all-MiniLM-L6-v2`` (384-dim, normalized).
- ``langchain_community.vectorstores.FAISS`` — one index per company, persisted
  under ``data/rag/company_<id>``.
- ``langchain_text_splitters.RecursiveCharacterTextSplitter`` — splits long
  free-text (reasoning, event summaries) into chunks.

Degrades gracefully: if LangChain / sentence-transformers / faiss aren't
importable (e.g. a minimal or memory-constrained deploy), retrieval returns an
empty context and callers fall back to deterministic generation — exactly as the
platform behaved before.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)

EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
PERSIST_ROOT = Path("data/rag")


class CompanyRAG:
    """Per-company retrieval over the company's database records."""

    def __init__(self) -> None:
        self._embeddings: Any = None
        self._splitter: Any = None
        self._available: bool | None = None
        self._stores: dict[int, Any] = {}  # company_id -> FAISS vector store

    # --- availability + lazy init -------------------------------------------
    def available(self) -> bool:
        """True when the LangChain + embedding + FAISS stack can be imported."""
        if self._available is not None:
            return self._available
        try:
            import faiss  # noqa: F401
            import sentence_transformers  # noqa: F401  (backs HuggingFaceEmbeddings)
            from langchain_community.vectorstores import FAISS  # noqa: F401
            from langchain_huggingface import HuggingFaceEmbeddings  # noqa: F401
            from langchain_text_splitters import RecursiveCharacterTextSplitter  # noqa: F401

            self._available = True
        except Exception as exc:  # noqa: BLE001
            logger.info("Company RAG unavailable (%s) — deterministic mode.", exc)
            self._available = False
        return self._available

    def _embed(self):
        if self._embeddings is None:
            from langchain_huggingface import HuggingFaceEmbeddings

            self._embeddings = HuggingFaceEmbeddings(
                model_name=EMBED_MODEL,
                encode_kwargs={"normalize_embeddings": True},
            )
        return self._embeddings

    def _splitter_(self):
        if self._splitter is None:
            from langchain_text_splitters import RecursiveCharacterTextSplitter

            self._splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
        return self._splitter

    # --- build Documents from the company's DB rows -------------------------
    def _company_documents(self, company_id: int) -> list:
        """Turn one company's database records into LangChain ``Document``s."""
        from langchain_core.documents import Document
        from sqlmodel import Session

        from app.db.session import engine
        from app.repositories import (
            ActionRepository,
            EventRepository,
            RiskRepository,
            TwinRepository,
        )

        docs: list[Document] = []
        with Session(engine) as s:
            twin = TwinRepository(s)
            nodes = twin.nodes(company_id)
            edges = twin.edges(company_id)
            risks = RiskRepository(s).for_company(company_id)
            actions = ActionRepository(s).for_company(company_id)
            events = EventRepository(s)

            def add(text: str, kind: str, source: str) -> None:
                docs.append(
                    Document(
                        page_content=text,
                        metadata={"company_id": company_id, "kind": kind, "source": source},
                    )
                )

            # Digital Twin nodes (suppliers / components / factories / …)
            for n in nodes:
                attrs = ", ".join(f"{k}={v}" for k, v in (n.attributes or {}).items())
                add(
                    f"{n.type.value.title()} '{n.name}' (key {n.key}) located in "
                    f"{n.country or 'an unspecified country'}. "
                    f"Attributes: {attrs or 'none recorded'}.",
                    "node",
                    f"twin:{n.key}",
                )

            # Twin edges (relationships) — resolve keys to readable names
            names = {n.key: n.name for n in nodes}
            for e in edges:
                add(
                    f"{names.get(e.source_key, e.source_key)} {e.type.value} "
                    f"{names.get(e.target_key, e.target_key)}.",
                    "edge",
                    f"edge:{e.id}",
                )

            # Risks + their triggering events
            seen_events: set[int] = set()
            for r in risks:
                factors = "; ".join(
                    f"{f.get('label')}={f.get('value')}" for f in (r.factors or [])
                )
                impact = "; ".join(
                    f"{i.get('label')}: {i.get('value')}" for i in (r.impact or [])
                )
                chain = " -> ".join(r.chain or [])
                add(
                    f"Risk '{r.title}' — severity {r.severity.value}, score {r.score}/100, "
                    f"confidence {r.confidence:.0%}. Supplier: {r.supplier or 'n/a'}. "
                    f"Revenue at risk: ${r.revenue_at_risk:,.0f}. "
                    f"Reasoning: {r.reasoning or 'n/a'} "
                    f"Contributing factors: {factors or 'n/a'}. "
                    f"Predicted impact: {impact or 'n/a'}. "
                    f"Cascade: {chain or 'n/a'}.",
                    "risk",
                    f"risk:{r.id}",
                )
                if r.event_id and r.event_id not in seen_events:
                    seen_events.add(r.event_id)
                    ev = events.get(r.event_id)
                    if ev and ev.summary:
                        add(
                            f"Triggering event ({ev.type}) in "
                            f"{ev.country or ev.location or 'unknown'}: {ev.summary}",
                            "event",
                            f"event:{ev.id}",
                        )

            # Mitigation history
            for a in actions:
                add(
                    f"Mitigation action '{a.title}' — status {a.status.value}, "
                    f"{a.priority.value} priority, owned by {a.department or a.owner or 'n/a'}. "
                    f"Estimated benefit: {a.estimated_benefit or 'n/a'}. "
                    f"Estimated cost: {a.estimated_cost or 'n/a'}.",
                    "action",
                    f"action:{a.id}",
                )

        # Split any long free-text; short records pass through unchanged.
        return self._splitter_().split_documents(docs)

    # --- indexing -----------------------------------------------------------
    def reindex(self, company_id: int) -> int:
        """(Re)build the company's FAISS index from its current DB records."""
        if not self.available():
            return 0
        from langchain_community.vectorstores import FAISS

        try:
            docs = self._company_documents(company_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Company RAG: failed to build docs for %s: %s", company_id, exc)
            return 0

        if not docs:
            self._stores.pop(company_id, None)
            self._clear_persist(company_id)
            return 0

        try:
            store = FAISS.from_documents(docs, self._embed())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Company RAG: embedding/index failed for %s: %s", company_id, exc)
            return 0

        self._stores[company_id] = store
        try:
            store.save_local(str(self._persist_dir(company_id)))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Company RAG: persist failed for %s: %s", company_id, exc)
        logger.info("Company RAG: indexed %d chunk(s) for company %s", len(docs), company_id)
        return len(docs)

    def _get_store(self, company_id: int):
        """Return the company's store, loading from disk or building on first use."""
        if company_id in self._stores:
            return self._stores[company_id]
        if not self.available():
            return None
        from langchain_community.vectorstores import FAISS

        persist = self._persist_dir(company_id)
        if persist.exists():
            try:
                store = FAISS.load_local(
                    str(persist), self._embed(), allow_dangerous_deserialization=True
                )
                self._stores[company_id] = store
                return store
            except Exception as exc:  # noqa: BLE001
                logger.warning("Company RAG: load failed for %s: %s", company_id, exc)
        # Not indexed yet — build it now.
        self.reindex(company_id)
        return self._stores.get(company_id)

    # --- retrieval ----------------------------------------------------------
    def retrieve(self, company_id: int, query: str, k: int = 5) -> list[tuple[str, float, dict]]:
        """Return up to ``k`` (text, relevance, metadata) hits for the company."""
        if not self.available():
            return []
        store = self._get_store(company_id)
        if store is None:
            return []
        try:
            hits = store.similarity_search_with_score(query, k=k)  # (doc, distance)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Company RAG: retrieve failed for %s: %s", company_id, exc)
            return []
        # FAISS returns L2 distance (lower = closer); map to a 0..1 relevance.
        return [
            (doc.page_content, 1.0 / (1.0 + float(dist)), doc.metadata) for doc, dist in hits
        ]

    def get_context(self, company_id: int, query: str, k: int = 5, max_chars: int = 3000) -> str:
        """Formatted grounding block of the company's most relevant records."""
        parts: list[str] = []
        total = 0
        for text, score, meta in self.retrieve(company_id, query, k):
            src = meta.get("source") or meta.get("kind") or "company-data"
            part = f"[{src} | relevance {score:.2f}]\n{text}\n"
            if total + len(part) > max_chars:
                break
            parts.append(part)
            total += len(part)
        return "\n---\n".join(parts)

    def stats(self, company_id: int) -> dict:
        store = self._get_store(company_id) if self.available() else None
        count = 0
        if store is not None:
            try:
                count = store.index.ntotal
            except Exception:  # noqa: BLE001
                count = 0
        return {
            "available": self.available(),
            "embed_model": EMBED_MODEL,
            "chunks": count,
            "indexed": store is not None,
        }

    # --- persistence helpers ------------------------------------------------
    def _persist_dir(self, company_id: int) -> Path:
        return PERSIST_ROOT / f"company_{company_id}"

    def _clear_persist(self, company_id: int) -> None:
        p = self._persist_dir(company_id)
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)


# Module-level singleton.
company_rag = CompanyRAG()


def get_company_rag() -> CompanyRAG:
    return company_rag
