"""RAG Knowledge Base endpoints: ingest, search, manage documents."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlmodel import Session

from app.api.deps import get_current_company_id
from app.db.session import get_session
from app.services.rag import get_rag_service, RetrievalResult

router = APIRouter(prefix="/rag", tags=["rag"])

# Default knowledge base path (inside container: /app/knowledge)
DEFAULT_KB_PATH = Path("/app/knowledge")


class IngestRequest(BaseModel):
    paths: list[str] | None = None  # relative to project root; None = default KB


class IngestResponse(BaseModel):
    ingested: int
    files: list[str]


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


class SearchResponse(BaseModel):
    results: list[dict]


@router.post("/ingest", response_model=IngestResponse)
def ingest_documents(
    payload: IngestRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> IngestResponse:
    """Ingest documents into the RAG knowledge base.

    If `paths` is null, ingests all PDF/DOCX/MD/TXT files from the project root
    (whitepapers, annexes, pitch deck notes, etc.).
    """
    rag = get_rag_service()
    rag.initialize()

    if payload.paths:
        paths = [DEFAULT_KB_PATH / p for p in payload.paths]
    else:
        # Default: scan project root for knowledge documents
        exts = {".pdf", ".docx", ".md", ".txt"}
        paths = [p for p in DEFAULT_KB_PATH.rglob("*") if p.suffix.lower() in exts and p.is_file()]

    files = [str(p.relative_to(DEFAULT_KB_PATH)) for p in paths if p.exists()]
    count = rag.add_documents(paths)
    return IngestResponse(ingested=count, files=files)


@router.post("/search", response_model=SearchResponse)
def search_knowledge_base(
    payload: SearchRequest,
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> SearchResponse:
    """Search the RAG knowledge base for relevant context."""
    rag = get_rag_service()
    if not rag.chunks:
        return SearchResponse(results=[])

    results: list[RetrievalResult] = rag.retrieve(payload.query, top_k=payload.top_k)
    return SearchResponse(results=[
        {
            "source": r.chunk.source,
            "source_type": r.chunk.source_type,
            "page": r.chunk.page,
            "section": r.chunk.section,
            "text": r.chunk.text[:500] + ("..." if len(r.chunk.text) > 500 else ""),
            "score": round(r.combined_score, 3),
            "vector_score": round(r.vector_score, 3),
            "keyword_score": round(r.keyword_score, 3),
        }
        for r in results
    ])


@router.get("/stats")
def rag_stats(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Get RAG knowledge base statistics."""
    rag = get_rag_service()
    return {
        "chunks": len(rag.chunks),
        "indexed": rag.index is not None,
        "sources": list(set(c.source for c in rag.chunks)),
        "source_types": list(set(c.source_type for c in rag.chunks)),
    }


@router.post("/reset")
def reset_knowledge_base(
    company_id: int = Depends(get_current_company_id),
    session: Session = Depends(get_session),
) -> dict:
    """Clear the RAG knowledge base (removes persisted index)."""
    rag = get_rag_service()
    rag.chunks = []
    rag.embeddings = None
    rag.index = None
    rag.bm25 = None
    # Remove persisted files
    for f in rag.persist_dir.glob("*"):
        try:
            f.unlink()
        except Exception:
            pass
    return {"message": "Knowledge base reset"}