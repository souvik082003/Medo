"""Profile, preferences, and resume repositories with strict user isolation."""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import CandidateProfile, CandidateSkill, ResumeVersion, Skill, UserPreference


class ProfileRepository:
    """Data-access layer for user-owned candidate profiles and preferences."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_active_profile(self, user_id: uuid.UUID) -> Optional[CandidateProfile]:
        return self.db.scalar(
            select(CandidateProfile)
            .where(CandidateProfile.user_id == user_id, CandidateProfile.is_active.is_(True))
            .order_by(CandidateProfile.updated_at.desc())
        )

    def get_or_create_active_profile(self, user_id: uuid.UUID) -> CandidateProfile:
        profile = self.get_active_profile(user_id)
        if profile is None:
            profile = CandidateProfile(user_id=user_id, is_active=True)
            self.db.add(profile)
            self.db.flush()
        return profile

    def get_preferences(self, user_id: uuid.UUID) -> Optional[UserPreference]:
        return self.db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))

    def get_or_create_preferences(self, user_id: uuid.UUID) -> UserPreference:
        pref = self.get_preferences(user_id)
        if pref is None:
            pref = UserPreference(user_id=user_id)
            self.db.add(pref)
            self.db.flush()
        return pref

    def list_resumes(self, user_id: uuid.UUID, limit: int = 20) -> list[ResumeVersion]:
        return list(
            self.db.scalars(
                select(ResumeVersion)
                .where(ResumeVersion.user_id == user_id)
                .order_by(ResumeVersion.created_at.desc())
                .limit(limit)
            ).all()
        )

    def list_candidate_skills(self, user_id: uuid.UUID, profile_id: uuid.UUID) -> list[tuple[CandidateSkill, Skill]]:
        rows = self.db.execute(
            select(CandidateSkill, Skill)
            .join(Skill, CandidateSkill.skill_id == Skill.id)
            .where(CandidateSkill.user_id == user_id, CandidateSkill.profile_id == profile_id)
            .order_by(CandidateSkill.confidence.desc())
        ).all()
        return [(cs, sk) for cs, sk in rows]
