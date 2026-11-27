"""Applications, feedback, and analytics endpoints."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...auth.dependencies import get_current_user
from ...core.database import get_db
from ...core.exceptions import AppError
from ...models import User
from ...repositories.application_repo import ApplicationRepository
from ...repositories.job_repo import JobRepository
from ...schemas.common import PaginatedResponse
from ...schemas.job import (
    AnalyticsResponse,
    ApplicationCreate,
    ApplicationResponse,
    ApplicationUpdate,
    FeedbackCreate,
    FeedbackResponse,
)
from ...services.analytics_service import get_user_analytics

router = APIRouter(prefix="/api/v1", tags=["applications"])


@router.get("/applications", response_model=PaginatedResponse[ApplicationResponse])
def list_applications(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ApplicationResponse]:
    repo = ApplicationRepository(db)
    items, total = repo.list_for_user(current_user.id, status=status, limit=limit, offset=offset)
    return PaginatedResponse(
        items=[ApplicationResponse.model_validate(a) for a in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/applications", response_model=ApplicationResponse, status_code=201)
def create_application(
    payload: ApplicationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationResponse:
    job_repo = JobRepository(db)
    job = job_repo.get_visible_job(payload.job_id, current_user.id)
    if job is None:
        raise AppError("JOB_NOT_FOUND", "Job not found.", status_code=404)

    app_repo = ApplicationRepository(db)
    existing = app_repo.get_by_job(payload.job_id, current_user.id)
    if existing is not None:
        raise AppError("APPLICATION_EXISTS", "Application for this job already exists.", status_code=409)

    app = app_repo.create(
        current_user.id,
        payload.job_id,
        resume_version_id=payload.resume_version_id,
        cover_letter_text=payload.cover_letter_text,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(app)
    return ApplicationResponse.model_validate(app)


@router.patch("/applications/{application_id}", response_model=ApplicationResponse)
def update_application(
    application_id: uuid.UUID,
    payload: ApplicationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ApplicationResponse:
    app_repo = ApplicationRepository(db)
    app = app_repo.get_by_id(application_id, current_user.id)
    if app is None:
        raise AppError("APPLICATION_NOT_FOUND", "Application not found.", status_code=404)

    app_repo.update_status(
        app,
        status=payload.status,
        notes=payload.notes,
        event_details=payload.event_details,
    )
    if payload.status in {"applied", "offer"}:
        fb_signal = "apply" if payload.status == "applied" else "offer"
        JobRepository(db).record_feedback(current_user.id, app.job_id, fb_signal, is_implicit=True)

    db.commit()
    db.refresh(app)
    return ApplicationResponse.model_validate(app)


@router.post("/feedback", response_model=FeedbackResponse, status_code=201)
def submit_feedback(
    payload: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FeedbackResponse:
    job_repo = JobRepository(db)
    job = job_repo.get_visible_job(payload.job_id, current_user.id)
    if job is None:
        raise AppError("JOB_NOT_FOUND", "Job not found.", status_code=404)

    if payload.signal_type in {"save", "shortlist", "dismiss"}:
        folder = {"save": "saved", "shortlist": "shortlisted", "dismiss": "dismissed"}[payload.signal_type]
        job_repo.save_job(current_user.id, payload.job_id, folder=folder)

    fb = job_repo.record_feedback(
        current_user.id,
        payload.job_id,
        payload.signal_type,
        is_implicit=payload.is_implicit,
        context_json=payload.context_json,
    )
    db.commit()
    db.refresh(fb)
    return FeedbackResponse.model_validate(fb)


@router.get("/analytics", response_model=AnalyticsResponse)
def analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsResponse:
    return get_user_analytics(db, current_user.id)
