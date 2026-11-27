"""ML matching and recommendation endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...auth.dependencies import get_current_user
from ...core.config import get_settings
from ...core.database import get_db
from ...core.rate_limit import rate_limit_dependency
from ...models import Job, JobMatch, ModelVersion, User
from ...repositories.profile_repo import ProfileRepository
from ...schemas.common import PaginatedResponse
from ...schemas.job import JobResponse
from ...schemas.recommendation import (
    JobMatchBatchResponse,
    JobMatchRequest,
    MatchExplainabilityResponse,
)
from ...services.matching_service import compute_matches_for_user, get_or_train_active_models

router = APIRouter(prefix="/api/v1", tags=["recommendations"])


def _to_explain_item(jm: JobMatch, job: Job, mv: ModelVersion) -> MatchExplainabilityResponse:
    return MatchExplainabilityResponse(
        job=JobResponse.model_validate(job),
        semantic_similarity=jm.semantic_similarity,
        compatibility_probability=jm.compatibility_probability,
        ranking_score=jm.ranking_score,
        confidence=jm.confidence,
        strong_matching_skills=jm.strong_matching_skills or [],
        missing_skills=jm.missing_skills or [],
        experience_match=jm.experience_match or {},
        location_match=jm.location_match or {},
        seniority_match=jm.seniority_match or {},
        ranking_reasons=jm.ranking_reasons or [],
        llm_explanation=jm.llm_explanation,
        model_version=f"{mv.name}:{mv.version}",
        training_data_provenance=mv.training_data_provenance,
        computed_at=jm.computed_at,
    )


@router.post(
    "/jobs/match",
    response_model=JobMatchBatchResponse,
    dependencies=[Depends(rate_limit_dependency(limit=30, window_seconds=60))],
)
def match_jobs(
    payload: JobMatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobMatchBatchResponse:
    settings = get_settings()
    pairs, mv = compute_matches_for_user(
        db,
        current_user,
        job_ids=payload.job_ids,
        explain_with_llm=payload.explain_with_llm,
        limit=payload.limit,
        settings=settings,
    )
    return JobMatchBatchResponse(
        matched_count=len(pairs),
        model_version=f"{mv.name}:{mv.version}",
        training_data_provenance=mv.training_data_provenance,
        items=[_to_explain_item(jm, job, mv) for jm, job in pairs],
    )


@router.get("/recommendations", response_model=PaginatedResponse[MatchExplainabilityResponse])
def get_recommendations(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    refresh: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaginatedResponse[MatchExplainabilityResponse]:
    settings = get_settings()
    profile = ProfileRepository(db).get_or_create_active_profile(current_user.id)

    existing_rows = db.execute(
        select(JobMatch, Job)
        .join(Job, JobMatch.job_id == Job.id)
        .where(
            JobMatch.user_id == current_user.id,
            JobMatch.profile_id == profile.id,
            Job.is_expired.is_(False),
        )
        .order_by(JobMatch.ranking_score.desc())
    ).all()

    if refresh or not existing_rows:
        pairs, mv = compute_matches_for_user(db, current_user, limit=100, settings=settings)
    else:
        _, _, mv = get_or_train_active_models(db, settings)
        pairs = [(jm, j) for jm, j in existing_rows]

    total = len(pairs)
    page = pairs[offset : offset + limit]
    return PaginatedResponse(
        items=[_to_explain_item(jm, job, mv) for jm, job in page],
        total=total,
        limit=limit,
        offset=offset,
    )
