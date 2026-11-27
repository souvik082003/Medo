"""Knowledge document ingestion, chunking, private-doc isolation, and default career guidance seeding."""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..ml.embeddings import EmbeddingService
from ..models import KnowledgeChunk, KnowledgeDocument

VALID_SOURCE_TYPES = {
    "job_description",
    "company_info",
    "candidate_doc",
    "career_guidance",
    "skill_desc",
    "interview_prep",
}


def chunk_text(text: str, *, chunk_size: int = 600, overlap: int = 100) -> list[str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    if len(cleaned) <= chunk_size:
        return [cleaned]
    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(len(cleaned), start + chunk_size)
        chunks.append(cleaned[start:end].strip())
        if end == len(cleaned):
            break
        start = max(start + 1, end - overlap)
    return chunks


def ingest_knowledge_document(
    db: Session,
    *,
    title: str,
    source_type: str,
    content: str,
    owner_user_id: Optional[uuid.UUID] = None,
    external_ref: Optional[str] = None,
    metadata_json: Optional[dict] = None,
    settings: Settings | None = None,
    embedding_service: EmbeddingService | None = None,
) -> KnowledgeDocument:
    """Chunk, embed, and store a knowledge document with strict private-doc ownership."""
    if source_type not in VALID_SOURCE_TYPES:
        raise ValueError(f"Invalid source_type '{source_type}'. Allowed: {sorted(VALID_SOURCE_TYPES)}")
    if source_type == "candidate_doc" and owner_user_id is None:
        raise ValueError("Private candidate_doc knowledge documents must specify owner_user_id.")

    cfg = settings or get_settings()
    emb = embedding_service or EmbeddingService(cfg)

    doc = KnowledgeDocument(
        owner_user_id=owner_user_id,
        source_type=source_type,
        title=title.strip(),
        external_ref=external_ref,
        metadata_json=metadata_json or {},
    )
    db.add(doc)
    db.flush()

    passages = chunk_text(content)
    vectors = emb.encode_batch(passages, kind="document") if passages else []
    for idx, (passage, vec) in enumerate(zip(passages, vectors)):
        db.add(
            KnowledgeChunk(
                document_id=doc.id,
                owner_user_id=owner_user_id,
                chunk_index=idx,
                content=passage,
                embedding=vec,
                metadata_json={"title": title, "source_type": source_type},
            )
        )
    db.flush()
    return doc


DEFAULT_PUBLIC_KNOWLEDGE: tuple[tuple[str, str, str], ...] = (
    (
        "ML Systems & Distributed Training Interview Guide",
        "interview_prep",
        "Key ML Systems interview topics include PyTorch DDP vs FSDP sharding, NCCL collective communication "
        "(all-reduce, all-gather, reduce-scatter), GPU memory optimization (activation checkpointing, mixed precision BF16), "
        "and LLM inference serving metrics (TTFT, TPOT, KV-cache paging in vLLM).",
    ),
    (
        "Hybrid Retrieval & RAG Architecture Best Practices",
        "skill_desc",
        "Production RAG combines dense Sentence Transformer embeddings in pgvector with sparse BM25 lexical search "
        "fused via Reciprocal Rank Fusion (RRF, k=60) and reranked by a Cross-Encoder. Always isolate private user "
        "documents by owner_user_id and defend against prompt injection in retrieved passages.",
    ),
    (
        "Learning-to-Rank & Implicit Feedback Guidance",
        "career_guidance",
        "Implicit signals such as save, shortlist, dismiss, apply, and interview are noisy proxies rather than ground truth. "
        "Evaluate recommendation models offline with NDCG@5, NDCG@10, MRR, and MAP using grouped candidate splits to prevent data leakage.",
    ),
)


def ensure_public_knowledge_seeded(db: Session, *, settings: Settings | None = None) -> int:
    """Seed baseline public career/interview/skill guidance if empty."""
    existing = db.scalar(
        select(KnowledgeDocument.id).where(KnowledgeDocument.owner_user_id.is_(None)).limit(1)
    )
    if existing is not None:
        return 0
    cfg = settings or get_settings()
    emb = EmbeddingService(cfg)
    added = 0
    for title, stype, body in DEFAULT_PUBLIC_KNOWLEDGE:
        ingest_knowledge_document(
            db,
            title=title,
            source_type=stype,
            content=body,
            owner_user_id=None,
            settings=cfg,
            embedding_service=emb,
        )
        added += 1
    db.commit()
    return added
