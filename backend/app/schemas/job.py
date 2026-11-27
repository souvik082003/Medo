"""Job, application, feedback, and analytics schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class JobCreateManual(BaseModel):
    title: str = Field(min_length=2, max_length=256)
    company: str = Field(min_length=1, max_length=256)
    location: Optional[str] = Field(default=None, max_length=256)
    region: Optional[str] = Field(default=None, max_length=16)
    description: str = Field(min_length=20)
    salary_raw: Optional[str] = Field(default=None, max_length=128)
    job_type: str = Field(default="full-time", max_length=32)
    work_mode: str = Field(default="unspecified", max_length=32)
    application_url: str = Field(min_length=8, max_length=1024)


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_name: str
    title: str
    company: str
    location: Optional[str] = None
    region: Optional[str] = None
    description: str
    salary_raw: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: Optional[str] = None
    salary_min_usd_eq: Optional[int] = None
    job_type: str
    work_mode: str
    min_education: Optional[str] = None
    seniority_level: Optional[str] = None
    application_url: str
    posted_at: Optional[datetime] = None
    is_expired: bool
    current_version: int = 1
    created_at: datetime


class JobSearchRequest(BaseModel):
    query: str = Field(default="", max_length=500)
    mode: Literal["hybrid", "dense", "bm25"] = "hybrid"
    use_reranker: bool = True
    region: Optional[str] = Field(default=None, max_length=16)
    include_global: bool = False
    work_mode: Optional[str] = Field(default=None, max_length=32)
    job_type: Optional[str] = Field(default=None, max_length=32)
    min_salary_usd_eq: Optional[int] = Field(default=None, ge=0)
    location_contains: Optional[str] = Field(default=None, max_length=128)
    description_contains: Optional[str] = Field(default=None, max_length=200)
    source_name: Optional[str] = Field(default=None, max_length=64)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class JobSearchResultItem(BaseModel):
    job: JobResponse
    dense_score: float
    bm25_score: float
    rrf_score: float
    rerank_score: Optional[float] = None
    final_score: float


class JobSourceHealthResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    source_type: str
    is_enabled: bool
    health_status: str
    consecutive_failures: int
    last_run_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_error: Optional[str] = None


class LiveIngestRequest(BaseModel):
    source: Literal[
        "all_free",
        "himalayas",
        "jobicy",
        "remotive",
        "remoteok",
        "arbeitnow",
        "hackernews",
        "themuse",
        "workingnomads",
        "greenhouse",
        "apify_linkedin",
        "adzuna",
        "jsearch_rapidapi",
        "serpapi_jobs",
    ] = "all_free"
    keywords: list[str] = Field(default_factory=lambda: ["Machine Learning Engineer", "AI Engineer"], max_length=5)
    region: str = Field(default="IN", max_length=16)
    limit: int = Field(default=15, ge=1, le=50)


class JobSourceCatalogItem(BaseModel):
    id: str
    name: str
    category: Literal["free_public", "paid_api_key"]
    is_free: bool
    requires_key: bool
    is_configured: bool
    env_vars: list[str] = Field(default_factory=list)
    pricing_usd: str
    pricing_inr: str
    free_tier: str
    coverage: str
    signup_url: str


class ApplicationCreate(BaseModel):
    job_id: uuid.UUID
    resume_version_id: Optional[uuid.UUID] = None
    cover_letter_text: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class ApplicationUpdate(BaseModel):
    status: Optional[
        Literal[
            "draft",
            "shortlisted",
            "approved",
            "applied",
            "phone_screen",
            "hr_interview",
            "hm_interview",
            "final_round",
            "offer",
            "rejected",
            "withdrawn",
            "archived",
        ]
    ] = None
    notes: Optional[str] = Field(default=None, max_length=2000)
    event_details: Optional[str] = Field(default=None, max_length=1000)


class ApplicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    job_id: uuid.UUID
    resume_version_id: Optional[uuid.UUID] = None
    status: str
    applied_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class FeedbackCreate(BaseModel):
    job_id: uuid.UUID
    signal_type: Literal["save", "shortlist", "dismiss", "apply", "interview", "offer", "thumbs_up", "thumbs_down"]
    is_implicit: bool = True
    context_json: dict[str, Any] = Field(default_factory=dict)


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    job_id: uuid.UUID
    signal_type: str
    relevance_weight: float
    is_implicit: bool
    created_at: datetime


class AnalyticsResponse(BaseModel):
    total_jobs: int
    total_saved: int
    total_applications: int
    applications_by_status: dict[str, int]
    jobs_by_source: dict[str, int]
    top_candidate_skills: list[dict[str, Any]]
    avg_compatibility_probability: Optional[float] = None
