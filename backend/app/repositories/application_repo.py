"""Application lifecycle repository with strict user isolation."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Application, ApplicationEvent, ApplicationStatus


class ApplicationRepository:
    """Data-access layer for user-owned applications and application events."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, app_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Application]:
        return self.db.scalar(
            select(Application).where(Application.id == app_id, Application.user_id == user_id)
        )

    def get_by_job(self, job_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Application]:
        return self.db.scalar(
            select(Application).where(Application.job_id == job_id, Application.user_id == user_id)
        )

    def list_for_user(
        self, user_id: uuid.UUID, *, status: Optional[str] = None, limit: int = 20, offset: int = 0
    ) -> tuple[list[Application], int]:
        base = select(Application).where(Application.user_id == user_id)
        if status:
            base = base.where(Application.status == status)
        total = self.db.scalar(select(func.count()).select_from(base.subquery())) or 0
        items = list(
            self.db.scalars(
                base.order_by(Application.updated_at.desc()).offset(offset).limit(limit)
            ).all()
        )
        return items, int(total)

    def create(
        self,
        user_id: uuid.UUID,
        job_id: uuid.UUID,
        *,
        resume_version_id: Optional[uuid.UUID] = None,
        cover_letter_text: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Application:
        app = Application(
            user_id=user_id,
            job_id=job_id,
            resume_version_id=resume_version_id,
            cover_letter_text=cover_letter_text,
            status=ApplicationStatus.DRAFT.value,
            notes=notes,
        )
        self.db.add(app)
        self.db.flush()
        self.db.add(
            ApplicationEvent(
                user_id=user_id,
                application_id=app.id,
                event_type="created",
                details="Application draft created.",
            )
        )
        return app

    def update_status(
        self,
        app: Application,
        *,
        status: Optional[str] = None,
        notes: Optional[str] = None,
        event_details: Optional[str] = None,
    ) -> Application:
        if status is not None:
            app.status = status
            if status == ApplicationStatus.APPLIED.value and app.applied_at is None:
                app.applied_at = datetime.now(timezone.utc)
        if notes is not None:
            app.notes = notes
        self.db.add(app)
        if status is not None or event_details is not None:
            self.db.add(
                ApplicationEvent(
                    user_id=app.user_id,
                    application_id=app.id,
                    event_type=status or "note",
                    details=event_details or f"Updated status to {app.status}",
                )
            )
        return app
