"""Job sources, normalized jobs, versions, embeddings, matches, saved jobs, applications, and feedback."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import GUID, JSONBType, VectorType
from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class ApplicationStatus(str, Enum):
    DRAFT = "draft"
    SHORTLISTED = "shortlisted"
    APPROVED = "approved"
    APPLIED = "applied"
    PHONE_SCREEN = "phone_screen"
    HR_INTERVIEW = "hr_interview"
    HM_INTERVIEW = "hm_interview"
    FINAL_ROUND = "final_round"
    OFFER = "offer"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    ARCHIVED = "archived"


class JobSource(Base, UUIDPrimaryKeyMixin):
    """Configured external or manual job ingestion source with health telemetry."""

    __tablename__ = "job_sources"

    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), default="official_api", nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rate_limit_per_min: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    health_status: Mapped[str] = mapped_column(String(32), default="healthy", nullable=False)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config_json: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)


class Job(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Normalized job posting (shared public catalog or owner-isolated private manual job)."""

    __tablename__ = "jobs"

    source_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("job_sources.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    source_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    external_id: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    owner_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    title: Mapped[str] = mapped_column(String(256), nullable=False)
    company: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    location: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    salary_raw: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    salary_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    salary_currency: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    salary_min_usd_eq: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    experience_min_years: Mapped[Optional[float]] = mapped_column(Numeric(4, 1), nullable=True)
    experience_max_years: Mapped[Optional[float]] = mapped_column(Numeric(4, 1), nullable=True)
    seniority_level: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    min_education: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    job_type: Mapped[str] = mapped_column(String(32), default="full-time", nullable=False, index=True)
    work_mode: Mapped[str] = mapped_column(String(32), default="unspecified", nullable=False, index=True)
    application_url: Mapped[str] = mapped_column(String(1024), nullable=False)

    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_expired: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    source_metadata: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)

    versions: Mapped[list["JobVersion"]] = relationship(
        "JobVersion", back_populates="job", cascade="all, delete-orphan"
    )
    embeddings: Mapped[list["JobEmbedding"]] = relationship(
        "JobEmbedding", back_populates="job", cascade="all, delete-orphan"
    )
    skills: Mapped[list["JobSkill"]] = relationship(
        "JobSkill", back_populates="job", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_jobs_source_external", "source_id", "external_id"),
    )


class JobVersion(Base, UUIDPrimaryKeyMixin):
    """Historical snapshot whenever an ingested job's description/salary/title changes."""

    __tablename__ = "job_versions"

    job_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_num: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    salary_raw: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    description_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    diff_summary: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    job: Mapped["Job"] = relationship("Job", back_populates="versions")

    __table_args__ = (UniqueConstraint("job_id", "version_num", name="uq_job_versions_job_ver"),)


class JobSkill(Base, UUIDPrimaryKeyMixin):
    """Normalized skill extracted from a job description."""

    __tablename__ = "job_skills"

    job_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("skills.id", ondelete="CASCADE"), nullable=False
    )
    requirement_type: Mapped[str] = mapped_column(String(16), default="required", nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    evidence_span: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    job: Mapped["Job"] = relationship("Job", back_populates="skills")
    skill: Mapped["Skill"] = relationship("Skill")

    __table_args__ = (UniqueConstraint("job_id", "skill_id", name="uq_job_skills_job_skill"),)


class JobEmbedding(Base, UUIDPrimaryKeyMixin):
    """Versioned vector embedding for a job posting."""

    __tablename__ = "job_embeddings"

    job_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    model_version_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("model_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[list[float]] = mapped_column(VectorType(384), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    job: Mapped["Job"] = relationship("Job", back_populates="embeddings")

    __table_args__ = (UniqueConstraint("job_id", "model_version_id", name="uq_job_embeddings_job_model"),)


class JobMatch(Base, UUIDPrimaryKeyMixin):
    """ML compatibility & ranking prediction with strictly separated LLM explanation."""

    __tablename__ = "job_matches"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("candidate_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    model_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(), ForeignKey("model_versions.id", ondelete="SET NULL"), nullable=True
    )

    semantic_similarity: Mapped[float] = mapped_column(Float, nullable=False)
    compatibility_probability: Mapped[float] = mapped_column(Float, nullable=False)
    ranking_score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    feature_vector_json: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    strong_matching_skills: Mapped[list[str]] = mapped_column(JSONBType(), default=list, nullable=False)
    missing_skills: Mapped[list[str]] = mapped_column(JSONBType(), default=list, nullable=False)
    experience_match: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    location_match: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    seniority_match: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    ranking_reasons: Mapped[list[str]] = mapped_column(JSONBType(), default=list, nullable=False)
    llm_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "profile_id", "job_id", name="uq_job_matches_user_prof_job"),)


class SavedJob(Base, UUIDPrimaryKeyMixin):
    """User-isolated saved/shortlisted/dismissed job bookmark."""

    __tablename__ = "saved_jobs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    folder: Mapped[str] = mapped_column(String(64), default="saved", nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_saved_jobs_user_job"),)


class Application(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """User job application lifecycle record."""

    __tablename__ = "applications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resume_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(), ForeignKey("resume_versions.id", ondelete="SET NULL"), nullable=True
    )
    cover_letter_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=ApplicationStatus.DRAFT.value, nullable=False)
    applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    events: Mapped[list["ApplicationEvent"]] = relationship(
        "ApplicationEvent", back_populates="application", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_applications_user_job"),)


class ApplicationEvent(Base, UUIDPrimaryKeyMixin):
    """Timestamped milestone/event for an application."""

    __tablename__ = "application_events"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    application: Mapped["Application"] = relationship("Application", back_populates="events")


class Feedback(Base, UUIDPrimaryKeyMixin):
    """Implicit & explicit relevance signals used carefully for ranking evaluation & training."""

    __tablename__ = "feedback"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    signal_type: Mapped[str] = mapped_column(String(32), nullable=False)
    relevance_weight: Mapped[float] = mapped_column(Float, nullable=False)
    is_implicit: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    context_json: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
