"""Candidate profile and preference API endpoints (/api/v1/profile)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from ...auth.dependencies import get_current_user
from ...core.config import get_settings
from ...core.database import get_db
from ...core.rate_limit import rate_limit_dependency
from ...ml.embeddings import EmbeddingService
from ...models import User
from ...repositories.profile_repo import ProfileRepository
from ...schemas.profile import (
    CandidateProfileResponse,
    ExtractedSkillResponse,
    ProfileBundleResponse,
    ResumeUploadResponse,
    ResumeVersionResponse,
    UserPreferenceResponse,
    UserPreferenceUpdate,
)
from ...services.resume_service import process_resume_upload

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


@router.get("", response_model=ProfileBundleResponse)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileBundleResponse:
    repo = ProfileRepository(db)
    profile = repo.get_or_create_active_profile(current_user.id)
    prefs = repo.get_or_create_preferences(current_user.id)
    db.commit()

    skill_rows = repo.list_candidate_skills(current_user.id, profile.id)
    skills = [
        ExtractedSkillResponse(
            canonical_name=sk.canonical_name,
            slug=sk.slug,
            category=sk.category,
            proficiency=cs.proficiency,
            extraction_method=cs.extraction_method,
            confidence=cs.confidence,
            evidence_span=cs.evidence_span,
            source_section=cs.source_section,
        )
        for cs, sk in skill_rows
    ]
    resumes = [ResumeVersionResponse.model_validate(r) for r in repo.list_resumes(current_user.id)]
    return ProfileBundleResponse(
        profile=CandidateProfileResponse.model_validate(profile),
        preferences=UserPreferenceResponse.model_validate(prefs),
        skills=skills,
        resumes=resumes,
    )


@router.put("/preferences", response_model=UserPreferenceResponse)
def update_preferences(
    payload: UserPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPreferenceResponse:
    repo = ProfileRepository(db)
    prefs = repo.get_or_create_preferences(current_user.id)
    for field_name, val in payload.model_dump().items():
        setattr(prefs, field_name, val)
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return UserPreferenceResponse.model_validate(prefs)


@router.post(
    "/resume",
    response_model=ResumeUploadResponse,
    status_code=201,
    dependencies=[Depends(rate_limit_dependency(limit=20, window_seconds=60))],
)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ResumeUploadResponse:
    settings = get_settings()
    # Read up to max_upload_size_bytes + 1 to fail fast on oversized files without unbounded RAM read
    content = await file.read(settings.max_upload_size_bytes + 1)
    emb_svc = EmbeddingService(settings)
    rv, extract = process_resume_upload(
        db,
        current_user,
        file.filename or "resume.txt",
        content,
        content_type=file.content_type,
        settings=settings,
        embedding_service=emb_svc,
    )
    profile = ProfileRepository(db).get_active_profile(current_user.id)
    return ResumeUploadResponse(
        resume=ResumeVersionResponse.model_validate(rv),
        profile=CandidateProfileResponse.model_validate(profile),
        extracted_skills=[
            ExtractedSkillResponse(
                canonical_name=s.canonical_name,
                slug=s.slug,
                category=s.category,
                proficiency=s.proficiency,
                extraction_method=s.extraction_method,
                confidence=s.confidence,
                evidence_span=s.evidence_span,
                source_section=s.source_section,
            )
            for s in extract.skills
        ],
        embedding_model=emb_svc.effective_model_name,
        embedding_dim=emb_svc.dimension,
    )
