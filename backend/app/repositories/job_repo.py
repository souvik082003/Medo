"""Job, saved-job, and feedback repositories enforcing tenant visibility."""
from __future__ import annotations

import hashlib
import uuid
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..models import Feedback, Job, JobSource, SavedJob


SIGNAL_WEIGHTS: dict[str, float] = {
    "dismiss": -1.0,
    "thumbs_down": -1.0,
    "save": 1.0,
    "thumbs_up": 1.0,
    "shortlist": 2.0,
    "apply": 3.0,
    "interview": 4.0,
    "offer": 5.0,
}


class JobRepository:
    """Data-access layer for jobs (public catalog + user-private manual jobs)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_or_create_source(self, name: str, source_type: str = "official_api") -> JobSource:
        src = self.db.scalar(select(JobSource).where(JobSource.name == name))
        if src is None:
            src = JobSource(name=name, source_type=source_type)
            self.db.add(src)
            self.db.flush()
        return src

    def get_visible_job(self, job_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Job]:
        return self.db.scalar(
            select(Job).where(
                Job.id == job_id,
                or_(Job.owner_user_id.is_(None), Job.owner_user_id == user_id),
            )
        )

    def list_visible_jobs(
        self,
        user_id: uuid.UUID,
        *,
        limit: int = 20,
        offset: int = 0,
        job_type: Optional[str] = None,
        work_mode: Optional[str] = None,
        region: Optional[str] = None,
        source_name: Optional[str] = None,
        include_expired: bool = False,
    ) -> tuple[list[Job], int]:
        base = select(Job).where(or_(Job.owner_user_id.is_(None), Job.owner_user_id == user_id))
        if not include_expired:
            base = base.where(Job.is_expired.is_(False))
        if job_type:
            base = base.where(Job.job_type == job_type)
        if work_mode:
            base = base.where(Job.work_mode == work_mode)
        if region:
            base = base.where(Job.region == region)
        if source_name:
            base = base.where(Job.source_name == source_name)

        total = self.db.scalar(select(func.count()).select_from(base.subquery())) or 0
        items = list(
            self.db.scalars(
                base.order_by(Job.posted_at.desc().nulls_last(), Job.created_at.desc())
                .offset(offset)
                .limit(limit)
            ).all()
        )
        return items, int(total)

    def save_job(self, user_id: uuid.UUID, job_id: uuid.UUID, folder: str = "saved", notes: str | None = None) -> SavedJob:
        existing = self.db.scalar(
            select(SavedJob).where(SavedJob.user_id == user_id, SavedJob.job_id == job_id)
        )
        if existing is not None:
            existing.folder = folder
            if notes is not None:
                existing.notes = notes
            self.db.add(existing)
            return existing
        saved = SavedJob(user_id=user_id, job_id=job_id, folder=folder, notes=notes)
        self.db.add(saved)
        return saved

    def record_feedback(
        self,
        user_id: uuid.UUID,
        job_id: uuid.UUID,
        signal_type: str,
        *,
        is_implicit: bool = True,
        context_json: dict | None = None,
    ) -> Feedback:
        weight = SIGNAL_WEIGHTS.get(signal_type, 0.0)
        fb = Feedback(
            user_id=user_id,
            job_id=job_id,
            signal_type=signal_type,
            relevance_weight=weight,
            is_implicit=is_implicit,
            context_json=context_json or {},
        )
        self.db.add(fb)
        return fb

    @staticmethod
    def compute_content_hash(title: str, company: str, location: str | None) -> str:
        raw = f"{(company or '').strip().lower()}|{(title or '').strip().lower()}|{(location or 'unknown').strip().lower()}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
