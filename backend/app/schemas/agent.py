"""Schemas for agent chat and conversation persistence."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: Optional[uuid.UUID] = None


class AgentChatResponse(BaseModel):
    conversation_id: uuid.UUID
    thread_id: str
    intent: str
    plan: list[str]
    execution_updates: list[str]
    tool_results_summary: list[dict[str, Any]]
    follow_up_questions: list[str] = Field(default_factory=list)
    pending_approval: Optional[dict[str, Any]] = None
    reply: str


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    execution_steps_json: list[Any]
    citations_json: list[Any]
    created_at: datetime


class ConversationSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    thread_id: str
    summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ConversationDetailResponse(ConversationSummaryResponse):
    messages: list[MessageResponse] = Field(default_factory=list)
