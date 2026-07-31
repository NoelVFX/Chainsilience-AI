"""RAG (Retrieval-Augmented Generation) Service.

Embeddings + vector store for domain knowledge grounding:
- Ingests PDFs, DOCX, Markdown, TXT from repo root /docs /knowledge
- FAISS index (local, no external deps) + sentence-transformers embeddings
- Hybrid retrieval: vector similarity + BM25 keyword overlap
- Provides context snippets to LLM calls in scenario, risk, recommendation modules

Optional dependencies (loaded lazily):
- numpy, sentence-transformers, faiss, torch (for semantic retrieval)
- pdfplumber, python-docx, markdown, beautifulsoup4 (for document parsing)
When optional deps are unavailable, the service degrades gracefully to deterministic
scenario generation with a clear log message.
"""
from __future__ import annotations

import hashlib
import json
import os
import pickle
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

# Core stdlib only - optional deps loaded lazily in methods
re_findall = re.findall
re_search = re.search
re_sub = re.sub


@dataclass
class DocumentChunk:
    """A chunk of text with metadata for retrieval."""
    id: str
    text: str
    source: str
    source_type: str  # pdf, docx, md, txt
    page: int | None = None
    section: str | None = None
    metadata: dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class RetrievalResult:
    """Result from hybrid retrieval."""
    chunk: DocumentChunk
    vector_score: float
    keyword_score: float
    combined_score: float


class BM25Index:
    """Lightweight BM25 implementation for keyword search."""

    def __init__(self):
        self.documents: list[str] = []
        self.doc_freqs: dict[str, int] = {}
        self.N = 0
        self.avgdl = 0.0

    def add_documents(self, texts: list[str]) -> None:
        self.documents = texts
        self.N = len(texts)
        total_len = 0
        for text in texts:
            tokens = self._tokenize(text)
            total_len += len(tokens)
            seen = set(tokens)
            for tok in seen:
                self.doc_freqs[tok] = self.doc_freqs.get(tok, 0) + 1
        self.avgdl = total_len / max(1, self.N)

    def _tokenize(self, text: str) -> list[str]:
        return re.findall(r'\b\w+\b', text.lower())

    def score(self, query: str) -> list[float]:
        if self.N == 0:
            return [0.0] * len(self.documents)
        tokens = self._tokenize(query)
        scores = []
        k1 = 1.5
        b = 0.75
        for i, doc in enumerate(self.documents):
            doc_tokens = self._tokenize(doc)
            dl = len(doc_tokens)
            score = 0.0
            for tok in tokens:
                if tok not in self.doc_freqs:
                    continue
                idf = math.log((self.N - self.doc_freqs[tok] + 0.5) / (self.doc_freqs[tok] + 0.5) + 1.0)
                tf = doc_tokens.count(tok)
                score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / self.avgdl))
            scores.append(score)
        return scores


class RAGService:
    """Main RAG service: embed, index, retrieve."""

    EMBED_MODEL = "all-MiniLM-L6-v2"  # 384-dim, fast, good quality
    CHUNK_SIZE = 500  # tokens (approx)
    CHUNK_OVERLAP = 50
    TOP_K = 5

    def __init__(self, persist_dir: str = "data/rag"):
        self.persist_dir = Path(persist_dir)
        self.persist_dir.mkdir(parents=True, exist_ok=True)

        self.chunks: list[DocumentChunk] = []
        self.embeddings: Optional["np.ndarray"] = None
        self.index: Any = None  # faiss.IndexFlatIP
        self.bm25 = BM25Index()
        self.embedder: Optional["SentenceTransformer"] = None
        self._initialized = False
        self._available = None  # None=unknown, True=available, False=unavailable

    def initialize(self) -> bool:
        """Load embedder and existing index if available."""
        # Check if heavy dependencies are available
        try:
            import numpy as np
            from sentence_transformers import SentenceTransformer
            import faiss
        except ImportError as e:
            print(f"RAG: Optional dependencies not available ({e}). Degrading to deterministic mode.")
            self._available = False
            self._initialized = True
            return False

        try:
            self.embedder = SentenceTransformer(self.EMBED_MODEL)
        except Exception as e:
            print(f"RAG: Failed to load embedder: {e}")
            self._available = False
            self._initialized = True
            return False

        index_path = self.persist_dir / "faiss.index"
        chunks_path = self.persist_dir / "chunks.pkl"
        bm25_path = self.persist_dir / "bm25.pkl"

        if index_path.exists() and chunks_path.exists():
            try:
                import faiss
                self.index = faiss.read_index(str(index_path))
                with open(chunks_path, "rb") as f:
                    self.chunks = pickle.load(f)
                if (self.persist_dir / "bm25.pkl").exists():
                    with open(self.persist_dir / "bm25.pkl", "rb") as f:
                        self.bm25 = pickle.load(f)
                self._available = True
                self._initialized = True
                print(f"RAG: Loaded index with {len(self.chunks)} chunks")
                return True
            except Exception as e:
                print(f"RAG: Failed to load index: {e}")

        self._available = True
        self._initialized = True
        return True

    def _get_embedder(self):
        if self.embedder is None:
            from sentence_transformers import SentenceTransformer
            self.embedder = SentenceTransformer(self.EMBED_MODEL)
        return self.embedder

    # --- Document loading ----------------------------------------------------

    def load_pdf(self, path: Path) -> list[DocumentChunk]:
        """Extract text from PDF with page-level chunks."""
        try:
            import pdfplumber
        except ImportError:
            return []
        chunks = []
        with pdfplumber.open(str(path)) as pdf:
            for page_num, page in enumerate(pdf.pages):
                text = page.extract_text()
                if not text or not text.strip():
                    continue
                page_chunks = self._chunk_text(text, f"page_{page_num + 1}")
                for i, chunk_text in enumerate(page_chunks):
                    chunks.append(DocumentChunk(
                        id=f"{path.name}_p{page_num + 1}_c{i}",
                        text=chunk_text,
                        source=path.name,
                        source_type="pdf",
                        page=page_num + 1,
                    ))
        return chunks

    def load_docx(self, path: Path) -> list[DocumentChunk]:
        """Extract text from DOCX with paragraph-level chunks."""
        try:
            from docx import Document
        except ImportError:
            return []
        chunks = []
        doc = Document(str(path))
        full_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        para_chunks = self._chunk_text(full_text, "paragraph")
        for i, chunk_text in enumerate(para_chunks):
            chunks.append(DocumentChunk(
                id=f"{path.name}_c{i}",
                text=chunk_text,
                source=path.name,
                source_type="docx",
            ))
        return chunks

    def load_markdown(self, path: Path) -> list[DocumentChunk]:
        """Extract text from Markdown, preserving headers as sections."""
        try:
            import markdown
            from bs4 import BeautifulSoup
        except ImportError:
            return []
        text = path.read_text(encoding="utf-8")
        html = markdown.markdown(text)
        soup = BeautifulSoup(html, "html.parser")

        chunks = []
        current_section = "intro"
        for elem in soup.find_all(["h1", "h2", "h3", "h4", "p", "li", "table"]):
            if elem.name in ("h1", "h2", "h3", "h4"):
                current_section = elem.get_text().strip()
            else:
                chunk_text = elem.get_text().strip()
                if len(chunk_text) > 30:
                    chunk_id = hashlib.md5(chunk_text.encode()).hexdigest()[:8]
                    chunks.append(DocumentChunk(
                        id=f"{path.name}_{chunk_id}",
                        text=chunk_text,
                        source=path.name,
                        source_type="md",
                        section=current_section,
                    ))
        return chunks

    def load_text(self, path: Path) -> list[DocumentChunk]:
        """Load plain text file."""
        text = path.read_text(encoding="utf-8")
        para_chunks = self._chunk_text(text, "paragraph")
        chunks = []
        for i, chunk_text in enumerate(para_chunks):
            chunks.append(DocumentChunk(
                id=f"{path.name}_c{i}",
                text=chunk_text,
                source=path.name,
                source_type="txt",
            ))
        return chunks

    def load_file(self, path: Path) -> list[DocumentChunk]:
        """Dispatch to appropriate loader by extension."""
        suffix = path.suffix.lower()
        if suffix == ".pdf":
            return self.load_pdf(path)
        elif suffix == ".docx":
            return self.load_docx(path)
        elif suffix in (".md", ".markdown"):
            return self.load_markdown(path)
        elif suffix in (".txt",):
            return self.load_text(path)
        return []

    def _chunk_text(self, text: str, section: str | None = None) -> list[str]:
        """Split text into overlapping chunks by approximate token count."""
        words = text.split()
        if len(words) <= self.CHUNK_SIZE:
            return [text]
        chunks = []
        start = 0
        while start < len(words):
            end = min(start + self.CHUNK_SIZE, len(words))
            chunk = " ".join(words[start:end])
            chunks.append(chunk)
            start += self.CHUNK_SIZE - self.CHUNK_OVERLAP
        return chunks

    # --- Indexing ------------------------------------------------------------

    def add_documents(self, paths: list[Path]) -> int:
        """Load, chunk, embed, and index documents."""
        if not self._initialized:
            self.initialize()

        if not self._available:
            print("RAG: Optional dependencies not available, skipping document indexing")
            return 0

        new_chunks = []
        for path in paths:
            if not path.exists():
                print(f"RAG: File not found: {path}")
                continue
            chunks = self.load_file(path)
            new_chunks.extend(chunks)
            print(f"RAG: Loaded {len(chunks)} chunks from {path.name}")

        if not new_chunks:
            return 0

        # Embed new chunks
        texts = [c.text for c in new_chunks]
        embedder = self._get_embedder()
        new_embeddings = embedder.encode(texts, normalize_embeddings=True, show_progress_bar=False)

        # Add to FAISS index
        if self.index is None:
            self.index = faiss.IndexFlatIP(new_embeddings.shape[1])
        self.index.add(new_embeddings.astype("float32"))

        # Add to BM25
        self.bm25.add_documents(texts)

        # Store chunks
        self.chunks.extend(new_chunks)
        self.embeddings = np.vstack([self.embeddings, new_embeddings]) if self.embeddings is not None else new_embeddings

        # Persist
        self._persist()
        return len(new_chunks)

    def _persist(self) -> None:
        """Save index, chunks, and BM25 to disk."""
        if self.index is not None:
            import faiss
            faiss.write_index(self.index, str(self.persist_dir / "faiss.index"))
        with open(self.persist_dir / "chunks.pkl", "wb") as f:
            pickle.dump(self.chunks, f)
        with open(self.persist_dir / "bm25.pkl", "wb") as f:
            pickle.dump(self.bm25, f)

    # --- Retrieval -----------------------------------------------------------

    def retrieve(self, query: str, top_k: int = TOP_K) -> list[RetrievalResult]:
        """Hybrid retrieval: vector + BM25, combined score."""
        if not self._available or not self.chunks or self.index is None:
            return []

        # Vector search
        embedder = self._get_embedder()
        q_emb = embedder.encode([query], normalize_embeddings=True).astype("float32")
        k = min(top_k * 3, len(self.chunks))  # over-fetch for fusion
        scores, indices = self.index.search(q_emb, k)

        # BM25 scores
        bm25_scores = self.bm25.score(query)

        # Combine
        results = []
        for i, idx in enumerate(indices[0]):
            if idx < 0 or idx >= len(self.chunks):
                continue
            vec_score = float(scores[0][i])
            kw_score = bm25_scores[idx] if idx < len(bm25_scores) else 0.0
            # Normalize and combine
            vec_norm = 1.0 / (1.0 + np.exp(-vec_score * 5))  # sigmoid-ish
            kw_norm = 1.0 / (1.0 + np.exp(-kw_score)) if kw_score > 0 else 0.0
            combined = 0.6 * vec_norm + 0.4 * kw_norm
            results.append(RetrievalResult(
                chunk=self.chunks[idx],
                vector_score=vec_norm,
                keyword_score=kw_norm,
                combined_score=combined,
            ))

        results.sort(key=lambda r: r.combined_score, reverse=True)
        return results[:top_k]

    def get_context(self, query: str, top_k: int = TOP_K, max_chars: int = 3000) -> str:
        """Get formatted context string for LLM prompt."""
        results = self.retrieve(query, top_k)
        if not results:
            return ""

        context_parts = []
        total_chars = 0
        for r in results:
            chunk = r.chunk
            prefix = f"[Source: {chunk.source}"
            if chunk.page:
                prefix += f", p.{chunk.page}"
            if chunk.section:
                prefix += f", §{chunk.section}"
            prefix += f" | Relevance: {r.combined_score:.2f}]"
            part = f"{prefix}\n{chunk.text}\n"
            if total_chars + len(part) > max_chars:
                break
            context_parts.append(part)
            total_chars += len(part)

        return "\n---\n".join(context_parts)


# Module-level singleton
rag_service = RAGService()


def get_rag_service() -> RAGService:
    return rag_service