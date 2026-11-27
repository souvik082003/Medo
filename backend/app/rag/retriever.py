"""Hybrid RAG retriever with tenant isolation and prompt-injection defense."""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Optional

from rank_bm25 import BM25Okapi
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..ml.embeddings import EmbeddingService, cosine_similarity
from ..models import KnowledgeChunk, KnowledgeDocument
from ..retrieval.hybrid import tokenize_bm25
from ..retrieval.reranker import CrossEncoderReranker

_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?", re.I),
    re.compile(r"disregard\s+(?:all\s+)?(?:previous|system)\s+prompt", re.I),
    re.compile(r"you\s+are\s+now\s+(?:a|an)\s+", re.I),
    re.compile(r"<\s*\|?\s*(?:system|im_start|assistant)\s*\|?\s*>", re.I),
    re.compile(r"reveal\s+(?:your\s+)?(?:system\s+prompt|api\s+key|secrets?)", re.I),
)


def sanitize_retrieved_passage(text: str) -> tuple[str, bool]:
    """Treat retrieved documents as untrusted data and neutralize prompt-injection patterns."""
    flagged = False
    cleaned = text
    for pat in _INJECTION_PATTERNS:
        if pat.search(cleaned):
            flagged = True
            cleaned = pat.sub("[FILTERED_UNTRUSTED_DIRECTIVE]", cleaned)
    return cleaned, flagged


@dataclass
class RetrievedKnowledgeChunk:
    document_id: uuid.UUID
    chunk_id: uuid.UUID
    title: str
    source_type: str
    snippet: str
    dense_score: float
    bm25_score: float
    rrf_score: float
    rerank_score: float
    injection_flagged: bool


class KnowledgeRetriever:
    """Hybrid dense + BM25 + RRF + Cross-Encoder retriever over KnowledgeChunk."""

    def __init__(
        self,
        db: Session,
        *,
        settings: Settings | None = None,
        embedding_service: EmbeddingService | None = None,
        reranker: CrossEncoderReranker | None = None,
    ) -> None:
        self.db = db
        self.settings = settings or get_settings()
        self.emb = embedding_service or EmbeddingService(self.settings)
        self.reranker = reranker or CrossEncoderReranker(self.settings)

    def retrieve(
        self,
        query: str,
        user_id: uuid.UUID,
        *,
        source_types: Optional[list[str]] = None,
        top_k: int = 5,
    ) -> list[RetrievedKnowledgeChunk]:
        stmt = (
            select(KnowledgeChunk, KnowledgeDocument)
            .join(KnowledgeDocument, KnowledgeChunk.document_id == KnowledgeDocument.id)
            .where(or_(KnowledgeChunk.owner_user_id.is_(None), KnowledgeChunk.owner_user_id == user_id))
        )
        if source_types:
            stmt = stmt.where(KnowledgeDocument.source_type.in_(source_types))

        rows = self.db.execute(stmt).all()
        if not rows:
            return []

        q_vec = self.emb.encode_one(query, kind="query")
        dense_ranked = sorted(
            (
                (
                    i,
                    cosine_similarity(q_vec, ch.embedding) if ch.embedding else 0.0,
                )
                for i, (ch, _) in enumerate(rows)
            ),
            key=lambda x: -x[1],
        )
        dense_rank_map = {idx: (r, sim) for r, (idx, sim) in enumerate(dense_ranked, start=1)}

        tokenized_docs = [tokenize_bm25(f"{doc.title} {ch.content}") for ch, doc in rows]
        q_tokens = tokenize_bm25(query)
        if q_tokens and any(tokenized_docs):
            bm25 = BM25Okapi(tokenized_docs)
            raw_b = bm25.get_scores(q_tokens)
            bm25_ranked = sorted(((i, float(raw_b[i])) for i in range(len(rows))), key=lambda x: -x[1])
        else:
            bm25_ranked = [(i, 0.0) for i in range(len(rows))]
        bm25_rank_map = {idx: (r, bscore) for r, (idx, bscore) in enumerate(bm25_ranked, start=1)}

        fused = []
        for idx, (ch, doc) in enumerate(rows):
            dr, d_sim = dense_rank_map[idx]
            br, b_score = bm25_rank_map[idx]
            rrf = (1.0 / (60 + dr)) + (1.0 / (60 + br))
            sanitized, flagged = sanitize_retrieved_passage(ch.content)
            fused.append((idx, ch, doc, d_sim, b_score, rrf, sanitized, flagged))

        fused.sort(key=lambda x: -x[5])
        pool = fused[: max(top_k * 2, 10)]
        ce_scores = self.reranker.score_pairs(query, [item[6] for item in pool])

        out: list[RetrievedKnowledgeChunk] = []
        for (idx, ch, doc, d_sim, b_score, rrf, sanitized, flagged), ce in zip(pool, ce_scores):
            out.append(
                RetrievedKnowledgeChunk(
                    document_id=doc.id,
                    chunk_id=ch.id,
                    title=doc.title,
                    source_type=doc.source_type,
                    snippet=sanitized,
                    dense_score=round(d_sim, 4),
                    bm25_score=round(b_score, 4),
                    rrf_score=round(rrf, 6),
                    rerank_score=round(ce, 4),
                    injection_flagged=flagged,
                )
            )
        out.sort(key=lambda x: -x.rerank_score)
        return out[:top_k]
