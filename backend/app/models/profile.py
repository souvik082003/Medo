"""Candidate profile, resume versions, normalized skill taxonomy, and user preferences."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import GUID, JSONBType, VectorType
from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class CandidateProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Structured candidate profile owned by a single user."""

    __tablename__ = "candidate_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    headline: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    years_experience: Mapped[Optional[float]] = mapped_column(Numeric(4, 1), nullable=True)
    seniority_level: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    education_level: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    current_location: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    work_authorization: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    target_roles_json: Mapped[list[Any]] = mapped_column(JSONBType(), default=list, nullable=False)
    analysis_json: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    completeness_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="profiles")
    skills: Mapped[list["CandidateSkill"]] = relationship(
        "CandidateSkill", back_populates="profile", cascade="all, delete-orphan"
    )
    resumes: Mapped[list["ResumeVersion"]] = relationship(
        "ResumeVersion", back_populates="profile", cascade="all, delete-orphan"
    )


class ResumeVersion(Base, UUIDPrimaryKeyMixin):
    """Versioned resume artifact (uploaded, tailored, or conversationally refined)."""

    __tablename__ = "resume_versions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(), ForeignKey("candidate_profiles.id", ondelete="SET NULL"), nullable=True
    )
    job_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    version_num: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), default="uploaded", nullable=False)
    filename: Mapped[str] = mapped_column(String(256), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    parsed_sections_json: Mapped[dict[str, Any]] = mapped_column(JSONBType(), default=dict, nullable=False)
    embedding: Mapped[Optional[list[float]]] = mapped_column(VectorType(384), nullable=True)
    embedding_model_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        GUID(), ForeignKey("model_versions.id", ondelete="SET NULL"), nullable=True
    )
    modification_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    profile: Mapped[Optional["CandidateProfile"]] = relationship("CandidateProfile", back_populates="resumes")


class Skill(Base, UUIDPrimaryKeyMixin):
    """Canonical normalized skill entry in the taxonomy."""

    __tablename__ = "skills"

    canonical_name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    embedding: Mapped[Optional[list[float]]] = mapped_column(VectorType(384), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    aliases: Mapped[list["SkillAlias"]] = relationship(
        "SkillAlias", back_populates="skill", cascade="all, delete-orphan"
    )


class SkillAlias(Base, UUIDPrimaryKeyMixin):
    """Normalized synonym mapping (e.g., 'reactjs', 'react.js' -> 'React')."""

    __tablename__ = "skill_aliases"

    skill_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)

    skill: Mapped["Skill"] = relationship("Skill", back_populates="aliases")


class CandidateSkill(Base, UUIDPrimaryKeyMixin):
    """Extracted skill linked to a candidate profile with evidence span and confidence."""

    __tablename__ = "candidate_skills"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("candidate_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("skills.id", ondelete="CASCADE"), nullable=False
    )
    proficiency: Mapped[str] = mapped_column(String(32), default="proficient", nullable=False)
    extraction_method: Mapped[str] = mapped_column(String(32), default="rule", nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    evidence_span: Mapped[str] = mapped_column(Text, nullable=False)
    source_section: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    profile: Mapped["CandidateProfile"] = relationship("CandidateProfile", back_populates="skills")
    skill: Mapped["Skill"] = relationship("Skill")

    __table_args__ = (UniqueConstraint("profile_id", "skill_id", name="uq_candidate_skills_profile_skill"),)


class UserPreference(Base, UUIDPrimaryKeyMixin):
    """Durable user profile preferences (location, salary, work mode, job types)."""

    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    preferred_roles: Mapped[list[str]] = mapped_column(JSONBType(), default=list, nullable=False)
    preferred_locations: Mapped[list[str]] = mapped_column(JSONBType(), default=list, nullable=False)
    preferred_regions: Mapped[list[str]] = mapped_column(JSONBType(), default=lambda: ["IN", "US"], nullable=False)
    preferred_currency: Mapped[str] = mapped_column(String(8), default="USD", nullable=False)
    min_salary: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    work_modes: Mapped[list[str]] = mapped_column(
        JSONBType(), default=lambda: ["remote", "hybrid", "onsite"], nullable=False
    )
    job_types: Mapped[list[str]] = mapped_column(JSONBType(), default=lambda: ["full-time"], nullable=False)
    company_sizes: Mapped[list[str]] = mapped_column(
        JSONBType(), default=lambda: ["startup", "mid-size", "large"], nullable=False
    )
    exclude_keywords: Mapped[list[str]] = mapped_column(JSONBType(), default=list, nullable=False)
    career_goals: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="preferences")
