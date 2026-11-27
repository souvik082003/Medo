"""Agent chat and conversation endpoints (/api/v1/agent/chat, /api/v1/conversations)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...agents.orchestrator import run_career_orchestrator
from ...auth.dependencies import get_current_user
from ...core.config import get_settings
from ...core.database import get_db
from ...core.exceptions import AppError
from ...core.observability import trace_stage
from ...core.rate_limit import rate_limit_dependency
from ...models import AgentMemory, ApprovalRequest, Conversation, Message, User
from ...schemas.agent import (
    AgentChatRequest,
    AgentChatResponse,
    ConversationDetailResponse,
    ConversationSummaryResponse,
    MessageResponse,
)
from ...schemas.common import PaginatedResponse

router = APIRouter(prefix="/api/v1", tags=["agents"])


@router.post(
    "/agent/chat",
    response_model=AgentChatResponse,
    dependencies=[Depends(rate_limit_dependency(limit=40, window_seconds=60))],
)
def agent_chat(
    payload: AgentChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentChatResponse:
    conv = None
    if payload.conversation_id:
        conv = db.scalar(
            select(Conversation).where(
                Conversation.id == payload.conversation_id,
                Conversation.user_id == current_user.id,
            )
        )
        if conv is None:
            raise AppError("CONVERSATION_NOT_FOUND", "Conversation not found.", status_code=404)
    else:
        conv = Conversation(
            user_id=current_user.id,
            title=payload.message.strip()[:80] or "Career Session",
            thread_id=f"{current_user.id}:{uuid.uuid4()}",
        )
        db.add(conv)
        db.flush()

    db.add(
        Message(
            conversation_id=conv.id,
            user_id=current_user.id,
            role="user",
            content=payload.message.strip(),
        )
    )
    db.flush()

    recent_msgs = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conv.id, Message.user_id == current_user.id)
            .order_by(Message.created_at.desc())
            .limit(8)
        ).all()
    )
    history = [{"role": m.role, "content": m.content} for m in reversed(recent_msgs) if m.content]

    with trace_stage("agent.orchestrator", message_len=len(payload.message)):
        res = run_career_orchestrator(
            db,
            current_user,
            payload.message.strip(),
            thread_id=conv.thread_id,
            conversation_id=conv.id,
            history=history[:-1],  # exclude just-inserted current user turn
            language=payload.language,
            settings=get_settings(),
        )

    db.add(
        Message(
            conversation_id=conv.id,
            user_id=current_user.id,
            role="assistant",
            content=res.reply,
            execution_steps_json=res.execution_updates,
            token_usage_json={
                "estimated_prompt_tokens": max(1, len(payload.message) // 4),
                "estimated_completion_tokens": max(1, len(res.reply) // 4),
            },
        )
    )
    conv.summary = f"Intent: {res.intent} | Steps: {', '.join(res.plan)}"
    db.add(conv)
    db.commit()

    return AgentChatResponse(
        conversation_id=conv.id,
        thread_id=conv.thread_id,
        intent=res.intent,
        plan=res.plan,
        execution_updates=res.execution_updates,
        tool_results_summary=res.tool_results_summary,
        follow_up_questions=res.follow_up_questions,
        pending_approval=res.pending_approval,
        reply=res.reply,
    )


@router.get("/conversations", response_model=PaginatedResponse[ConversationSummaryResponse])
def list_conversations(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ConversationSummaryResponse]:
    base = select(Conversation).where(Conversation.user_id == current_user.id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = list(
        db.scalars(base.order_by(Conversation.updated_at.desc()).offset(offset).limit(limit)).all()
    )
    return PaginatedResponse(
        items=[ConversationSummaryResponse.model_validate(c) for c in items],
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDetailResponse:
    conv = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    if conv is None:
        raise AppError("CONVERSATION_NOT_FOUND", "Conversation not found.", status_code=404)
    msgs = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conv.id, Message.user_id == current_user.id)
            .order_by(Message.created_at.asc())
        ).all()
    )
    return ConversationDetailResponse(
        id=conv.id,
        title=conv.title,
        thread_id=conv.thread_id,
        summary=conv.summary,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[MessageResponse.model_validate(m) for m in msgs],
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a user-owned conversation and its messages while preserving audit/memory refs cleanly."""
    conv = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    if conv is None:
        raise AppError("CONVERSATION_NOT_FOUND", "Conversation not found.", status_code=404)

    for mem in db.scalars(
        select(AgentMemory).where(AgentMemory.source_conversation_id == conv.id)
    ).all():
        mem.source_conversation_id = None
    for ap in db.scalars(
        select(ApprovalRequest).where(ApprovalRequest.conversation_id == conv.id)
    ).all():
        ap.conversation_id = None

    db.delete(conv)
    db.commit()
