"""Schemas for ML job matching and explainable recommendations."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from .job import JobResponse


class JobMatchRequest(BaseModel):
    job_ids: Optional[list[uuid.UUID]] = None
    explain_with_llm: bool = False
    limit: int = Field(default=50, ge=1, le=200)


class MatchExplainabilityResponse(BaseModel):
    job: JobResponse
    semantic_similarity: float
    compatibility_probability: float
    ranking_score: float
    confidence: float
    strong_matching_skills: list[str]
    missing_skills: list[str]
    experience_match: dict[str, Any]
    location_match: dict[str, Any]
    seniority_match: dict[str, Any]
    ranking_reasons: list[str]
    llm_explanation: Optional[str] = None
    model_version: str
    training_data_provenance: str
    computed_at: datetime


class JobMatchBatchResponse(BaseModel):
    matched_count: int
    model_version: str
    training_data_provenance: str
    items: list[MatchExplainabilityResponse]
