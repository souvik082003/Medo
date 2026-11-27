"""Real database-backed analytics service (never fabricates metrics)."""
from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..models import Application, CandidateProfile, CandidateSkill, Job, JobMatch, SavedJob, Skill
from ..schemas.job import AnalyticsResponse


def get_user_analytics(db: Session, user_id: uuid.UUID) -> AnalyticsResponse:
    """Compute real application, job, skill, and match statistics from PostgreSQL/SQLite."""
    total_jobs = db.scalar(
        select(func.count(Job.id)).where(
            or_(Job.owner_user_id.is_(None), Job.owner_user_id == user_id),
            Job.is_expired.is_(False),
        )
    ) or 0

    total_saved = db.scalar(
        select(func.count(SavedJob.id)).where(SavedJob.user_id == user_id)
    ) or 0

    app_rows = db.execute(
        select(Application.status, func.count(Application.id))
        .where(Application.user_id == user_id)
        .group_by(Application.status)
    ).all()
    apps_by_status = {status: int(cnt) for status, cnt in app_rows}
    total_applications = sum(apps_by_status.values())

    src_rows = db.execute(
        select(Job.source_name, func.count(Job.id))
        .where(or_(Job.owner_user_id.is_(None), Job.owner_user_id == user_id))
        .group_by(Job.source_name)
    ).all()
    jobs_by_source = {src: int(cnt) for src, cnt in src_rows}

    profile = db.scalar(
        select(CandidateProfile).where(
            CandidateProfile.user_id == user_id, CandidateProfile.is_active.is_(True)
        )
    )
    top_skills: list[dict] = []
    if profile is not None:
        skill_rows = db.execute(
            select(Skill.canonical_name, Skill.category, CandidateSkill.confidence)
            .join(CandidateSkill, CandidateSkill.skill_id == Skill.id)
            .where(CandidateSkill.user_id == user_id, CandidateSkill.profile_id == profile.id)
            .order_by(CandidateSkill.confidence.desc())
            .limit(15)
        ).all()
        top_skills = [
            {"name": name, "category": cat, "confidence": round(float(conf), 3)}
            for name, cat, conf in skill_rows
        ]

    avg_compat = db.scalar(
        select(func.avg(JobMatch.compatibility_probability)).where(JobMatch.user_id == user_id)
    )

    return AnalyticsResponse(
        total_jobs=int(total_jobs),
        total_saved=int(total_saved),
        total_applications=int(total_applications),
        applications_by_status=apps_by_status,
        jobs_by_source=jobs_by_source,
        top_candidate_skills=top_skills,
        avg_compatibility_probability=round(float(avg_compat), 4) if avg_compat is not None else None,
    )
