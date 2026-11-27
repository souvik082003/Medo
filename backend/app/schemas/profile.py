"""Candidate profile, preferences, resume, and skill schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserPreferenceUpdate(BaseModel):
    preferred_roles: list[str] = Field(default_factory=list)
    preferred_locations: list[str] = Field(default_factory=list)
    preferred_regions: list[str] = Field(default_factory=lambda: ["IN", "US"])
    preferred_currency: str = Field(default="USD", max_length=8)
    min_salary: Optional[int] = Field(default=None, ge=0)
    work_modes: list[str] = Field(default_factory=lambda: ["remote", "hybrid", "onsite"])
    job_types: list[str] = Field(default_factory=lambda: ["full-time"])
    company_sizes: list[str] = Field(default_factory=lambda: ["startup", "mid-size", "large"])
    exclude_keywords: list[str] = Field(default_factory=list)
    career_goals: Optional[str] = Field(default=None, max_length=2000)


class UserPreferenceResponse(UserPreferenceUpdate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    updated_at: datetime


class ExtractedSkillResponse(BaseModel):
    canonical_name: str
    slug: str
    category: str
    proficiency: str
    extraction_method: str
    confidence: float
    evidence_span: str
    source_section: Optional[str] = None


class ResumeVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_num: int
    kind: str
    filename: str
    mime_type: str
    file_size_bytes: int
    sha256_hash: str
    is_primary: bool
    parsed_sections_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CandidateProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    headline: Optional[str] = None
    summary: Optional[str] = None
    years_experience: Optional[float] = None
    seniority_level: Optional[str] = None
    education_level: Optional[str] = None
    current_location: Optional[str] = None
    work_authorization: Optional[str] = None
    target_roles_json: list[Any] = Field(default_factory=list)
    completeness_score: float = 0.0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class ProfileBundleResponse(BaseModel):
    profile: Optional[CandidateProfileResponse] = None
    preferences: Optional[UserPreferenceResponse] = None
    skills: list[ExtractedSkillResponse] = Field(default_factory=list)
    resumes: list[ResumeVersionResponse] = Field(default_factory=list)


class ResumeUploadResponse(BaseModel):
    resume: ResumeVersionResponse
    profile: CandidateProfileResponse
    extracted_skills: list[ExtractedSkillResponse]
    embedding_model: str
    embedding_dim: int
