"""API endpoints for Agentic RAG, 3-Tier Memory, and Human-in-the-Loop Approvals."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...auth.dependencies import get_current_user
from ...core.config import get_settings
from ...core.database import get_db
from ...core.exceptions import AppError
from ...core.observability import trace_stage
from ...core.rate_limit import rate_limit_dependency
from ...memory.service import MemoryService
from ...models import KnowledgeDocument, User
from ...rag.knowledge import ensure_public_knowledge_seeded, ingest_knowledge_document
from ...rag.pipeline import run_agentic_rag
from ...schemas.rag_memory import (
    ApprovalDecisionRequest,
    ApprovalRequestResponse,
    MemoryCreateRequest,
    MemoryResponse,
    MemoryUpdateRequest,
    RagDocumentCreate,
    RagDocumentResponse,
    RagQueryRequest,
    RagQueryResponse,
)
from ...services.approval_service import decide_approval, list_approvals

router = APIRouter(prefix="/api/v1", tags=["rag-memory-approvals"])


# ── RAG Endpoints ─────────────────────────────────────────────────────────────

@router.post("/rag/documents", response_model=RagDocumentResponse, status_code=201)
def add_rag_document(
    payload: RagDocumentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RagDocumentResponse:
    # Candidate docs & user-submitted notes are isolated to current_user.id
    owner_id = current_user.id if payload.source_type == "candidate_doc" else current_user.id
    doc = ingest_knowledge_document(
        db,
        title=payload.title,
        source_type=payload.source_type,
        content=payload.content,
        owner_user_id=owner_id,
        settings=get_settings(),
    )
    db.commit()
    db.refresh(doc)
    return RagDocumentResponse.model_validate(doc)


@router.get("/rag/documents", response_model=list[RagDocumentResponse])
def list_rag_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RagDocumentResponse]:
    ensure_public_knowledge_seeded(db, settings=get_settings())
    docs = db.scalars(
        select(KnowledgeDocument)
        .where(or_(KnowledgeDocument.owner_user_id.is_(None), KnowledgeDocument.owner_user_id == current_user.id))
        .order_by(KnowledgeDocument.created_at.desc())
    ).all()
    return [RagDocumentResponse.model_validate(d) for d in docs]


@router.post(
    "/rag/query",
    response_model=RagQueryResponse,
    dependencies=[Depends(rate_limit_dependency(limit=40, window_seconds=60))],
)
def query_rag(
    payload: RagQueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RagQueryResponse:
    settings = get_settings()
    ensure_public_knowledge_seeded(db, settings=settings)
    conv_summary = None
    if payload.conversation_id:
        ctx = MemoryService(db, settings=settings).get_recent_conversation_context(
            payload.conversation_id, current_user.id
        )
        conv_summary = ctx.get("summary")

    with trace_stage("rag.pipeline", query_len=len(payload.query)):
        res = run_agentic_rag(
            db,
            current_user.id,
            payload.query,
            conversation_summary=conv_summary,
            llm_consent_granted=current_user.llm_consent_granted,
            language=payload.language,
            settings=settings,
        )
    return RagQueryResponse(
        query=res.query,
        query_class=res.query_class,
        rewritten_queries=res.rewritten_queries,
        answer=res.answer,
        citations=res.citations,
        grounded=res.grounded,
        confidence=res.confidence,
        retries_used=res.retries_used,
        limitations=res.limitations,
    )


# ── Memory Endpoints ──────────────────────────────────────────────────────────

@router.get("/memory", response_model=list[MemoryResponse])
def get_memories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MemoryResponse]:
    mems = MemoryService(db, settings=get_settings()).list_memories(current_user.id)
    return [MemoryResponse.model_validate(m) for m in mems]


@router.post("/memory", response_model=MemoryResponse, status_code=201)
def upsert_memory(
    payload: MemoryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoryResponse:
    mem, _conflict = MemoryService(db, settings=get_settings()).extract_and_store_memory(
        current_user,
        memory_type=payload.memory_type,
        key=payload.key,
        value_text=payload.value_text,
        confirmed_by_user=payload.confirmed_by_user,
    )
    return MemoryResponse.model_validate(mem)


@router.patch("/memory/{memory_id}", response_model=MemoryResponse)
def patch_memory(
    memory_id: uuid.UUID,
    payload: MemoryUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoryResponse:
    mem = MemoryService(db, settings=get_settings()).update_memory(
        current_user.id,
        memory_id,
        value_text=payload.value_text,
        confirmation_status=payload.confirmation_status,
    )
    if mem is None:
        raise AppError("MEMORY_NOT_FOUND", "Memory entry not found.", status_code=404)
    return MemoryResponse.model_validate(mem)


@router.delete("/memory/{memory_id}", status_code=204)
def delete_memory(
    memory_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deleted = MemoryService(db, settings=get_settings()).delete_memory(current_user.id, memory_id)
    if not deleted:
        raise AppError("MEMORY_NOT_FOUND", "Memory entry not found.", status_code=404)
    return None


# ── Human Approval Endpoints ──────────────────────────────────────────────────

@router.get("/approvals", response_model=list[ApprovalRequestResponse])
def get_approvals(
    status: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ApprovalRequestResponse]:
    rows = list_approvals(db, current_user.id, status=status)
    return [ApprovalRequestResponse.model_validate(r) for r in rows]


@router.post("/approvals/{approval_id}/decide", response_model=ApprovalRequestResponse)
def decide_approval_endpoint(
    approval_id: uuid.UUID,
    payload: ApprovalDecisionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApprovalRequestResponse:
    updated = decide_approval(
        db,
        current_user,
        approval_id,
        decision=payload.decision,
        decision_note=payload.decision_note,
    )
    return ApprovalRequestResponse.model_validate(updated)
