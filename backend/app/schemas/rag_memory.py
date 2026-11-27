"""Schemas for Agentic RAG, 3-tier Memory, and Human-in-the-Loop Approvals."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class RagDocumentCreate(BaseModel):
    title: str = Field(min_length=2, max_length=256)
    source_type: Literal[
        "job_description",
        "company_info",
        "candidate_doc",
        "career_guidance",
        "skill_desc",
        "interview_prep",
    ] = "candidate_doc"
    content: str = Field(min_length=10, max_length=50000)


class RagDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_user_id: Optional[uuid.UUID] = None
    source_type: str
    title: str
    created_at: datetime


class RagQueryRequest(BaseModel):
    query: str = Field(min_length=2, max_length=1000)
    conversation_id: Optional[uuid.UUID] = None


class RagQueryResponse(BaseModel):
    query: str
    query_class: str
    rewritten_queries: list[str]
    answer: str
    citations: list[dict[str, Any]]
    grounded: bool
    confidence: float
    retries_used: int
    limitations: Optional[str] = None


class MemoryCreateRequest(BaseModel):
    memory_type: Literal["preference", "career_decision", "feedback", "learned_context"] = "preference"
    key: str = Field(min_length=1, max_length=128)
    value_text: str = Field(min_length=1, max_length=2000)
    confirmed_by_user: bool = True


class MemoryUpdateRequest(BaseModel):
    value_text: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    confirmation_status: Optional[Literal["confirmed", "rejected", "inferred"]] = None


class MemoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    memory_type: str
    key: str
    value_text: str
    confirmation_status: str
    confidence: float
    updated_at: datetime


class ApprovalDecisionRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    decision_note: Optional[str] = Field(default=None, max_length=500)


class ApprovalRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action_type: str
    payload_json: dict[str, Any]
    status: str
    decision_note: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime
