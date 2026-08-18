"""Company RAG endpoints: (re)index and search the caller's own company data.

Retrieval is strictly scoped to the authenticated user's company — the index is
built from that company's Digital Twin, risks, events and mitigation actions.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_company_id
from app.services.rag_company import get_company_rag

router = APIRouter(prefix="/rag", tags=["rag"])


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


class SearchHit(BaseModel):
    text: str
    kind: str
    source: str
    relevance: float


class SearchResponse(BaseModel):
    results: list[SearchHit]


class ReindexResponse(BaseModel):
    chunks: int
    available: bool


@router.post("/reindex", response_model=ReindexResponse)
def reindex(company_id: int = Depends(get_current_company_id)) -> ReindexResponse:
    """Rebuild this company's RAG index from its current database records."""
    rag = get_company_rag()
    count = rag.reindex(company_id)
    return ReindexResponse(chunks=count, available=rag.available())


@router.post("/search", response_model=SearchResponse)
def search(
    payload: SearchRequest, company_id: int = Depends(get_current_company_id)
) -> SearchResponse:
    """Retrieve the company's most relevant records for a query."""
    rag = get_company_rag()
    hits = rag.retrieve(company_id, payload.query, k=payload.top_k)
    return SearchResponse(
        results=[
            SearchHit(
                text=text,
                kind=str(meta.get("kind", "")),
                source=str(meta.get("source", "")),
                relevance=round(score, 3),
            )
            for text, score, meta in hits
        ]
    )


@router.get("/stats")
def rag_stats(company_id: int = Depends(get_current_company_id)) -> dict:
    """RAG index status for this company."""
    return get_company_rag().stats(company_id)
