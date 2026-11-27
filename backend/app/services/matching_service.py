"""ML matching & recommendation service strictly separating ML predictions from LLM explanations."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..core.exceptions import AppError
from ..ml.compatibility import (
    CompatibilityModelWrapper,
    generate_synthetic_compatibility_dataset,
    train_and_compare_compatibility_models,
)
from ..ml.embeddings import EmbeddingService, cosine_similarity
from ..ml.features import build_match_features
from ..models import (
    CandidateProfile,
    Feedback,
    Job,
    JobEmbedding,
    JobMatch,
    JobSkill,
    ModelVersion,
    ResumeVersion,
    Skill,
    User,
)
from ..ranking.ltr import LearnedRankerWrapper, train_and_compare_rankers
from ..repositories.profile_repo import ProfileRepository
from .llm_provider import LLMProvider


def _artifact_dir(settings: Settings) -> Path:
    d = settings.storage_root / "ml_artifacts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_or_train_active_models(
    db: Session, settings: Settings | None = None
) -> tuple[CompatibilityModelWrapper, LearnedRankerWrapper, ModelVersion]:
    """Load trained compatibility + LTR models, or train on clearly-labeled synthetic_dev bootstrap data."""
    cfg = settings or get_settings()
    art_dir = _artifact_dir(cfg)
    compat_path = art_dir / "compatibility_model.pkl"
    ranker_path = art_dir / "ltr_ranker.pkl"

    mv = db.scalar(
        select(ModelVersion)
        .where(ModelVersion.model_kind == "ranker", ModelVersion.is_active.is_(True))
        .order_by(ModelVersion.created_at.desc())
    )

    if compat_path.exists() and ranker_path.exists() and mv is not None:
        return CompatibilityModelWrapper.load(compat_path), LearnedRankerWrapper.load(ranker_path), mv

    X, y_bin, y_rel, groups = generate_synthetic_compatibility_dataset(n_candidates=80, jobs_per_candidate=15, seed=42)
    compat_wrapper, compat_reports = train_and_compare_compatibility_models(X, y_bin, groups, provenance="synthetic_dev")
    ranker_wrapper, ranker_reports = train_and_compare_rankers(X, y_rel, groups, provenance="synthetic_dev")

    compat_wrapper.save(compat_path)
    ranker_wrapper.save(ranker_path)

    compat_mv = db.scalar(
        select(ModelVersion).where(
            ModelVersion.model_kind == "compatibility",
            ModelVersion.name == compat_wrapper.model_name,
            ModelVersion.version == "v1",
        )
    )
    if compat_mv is None:
        compat_mv = ModelVersion(
            model_kind="compatibility",
            name=compat_wrapper.model_name,
            version="v1",
            artifact_path=str(compat_path),
            training_data_provenance="synthetic_dev",
            metrics_json=compat_wrapper.metrics,
            is_active=True,
        )
        db.add(compat_mv)

    ranker_mv = db.scalar(
        select(ModelVersion).where(
            ModelVersion.model_kind == "ranker",
            ModelVersion.name == ranker_wrapper.model_name,
            ModelVersion.version == "v1",
        )
    )
    if ranker_mv is None:
        ranker_mv = ModelVersion(
            model_kind="ranker",
            name=ranker_wrapper.model_name,
            version="v1",
            artifact_path=str(ranker_path),
            training_data_provenance="synthetic_dev",
            metrics_json=ranker_wrapper.metrics,
            is_active=True,
        )
        db.add(ranker_mv)

    db.flush()
    return compat_wrapper, ranker_wrapper, ranker_mv


def _compute_interaction_affinity(db: Session, user_id: uuid.UUID, job: Job) -> float:
    """Compute historical implicit/explicit interaction affinity from prior feedback."""
    rows = db.execute(
        select(Feedback.relevance_weight, Job.company)
        .join(Job, Feedback.job_id == Job.id)
        .where(Feedback.user_id == user_id, Feedback.job_id != job.id)
    ).all()
    if not rows:
        return 0.5
    same_co = [float(w) for w, co in rows if co and job.company and co.lower() == job.company.lower()]
    if same_co:
        avg = sum(same_co) / len(same_co)
        return max(0.0, min(1.0, 0.5 + 0.1 * avg))
    avg_all = sum(float(w) for w, _ in rows) / len(rows)
    return max(0.2, min(0.8, 0.5 + 0.05 * avg_all))


def _generate_grounded_llm_explanation(
    llm: LLMProvider,
    *,
    job: Job,
    prob: float,
    strong_skills: list[str],
    missing_skills: list[str],
    reasons: list[str],
) -> str:
    """Generate concise narrative strictly grounded in ML predictions (never invents evidence)."""
    prompt = (
        "Summarize why this job matches or has gaps for the candidate using ONLY the verified ML outputs below. "
        "Do NOT invent any skills or experience.\n"
        f"Role: {job.title} @ {job.company}\n"
        f"ML Compatibility Probability: {prob:.2f}\n"
        f"Verified Matching Skills: {', '.join(strong_skills) or 'None'}\n"
        f"Verified Missing Skills: {', '.join(missing_skills) or 'None'}\n"
        f"Deterministic ML Reasons: {'; '.join(reasons)}\n"
    )
    resp = llm.complete(prompt, max_tokens=220)
    return resp.text


def compute_matches_for_user(
    db: Session,
    user: User,
    *,
    job_ids: Optional[list[uuid.UUID]] = None,
    explain_with_llm: bool = False,
    limit: int = 50,
    settings: Settings | None = None,
) -> tuple[list[tuple[JobMatch, Job]], ModelVersion]:
    """Compute ML compatibility + LTR ranking scores for visible jobs and persist JobMatch records."""
    cfg = settings or get_settings()
    if explain_with_llm and not user.llm_consent_granted:
        raise AppError(
            "LLM_CONSENT_REQUIRED",
            "Explicit LLM consent is required before generating LLM explanations.",
            status_code=403,
        )

    prof_repo = ProfileRepository(db)
    profile = prof_repo.get_or_create_active_profile(user.id)
    prefs = prof_repo.get_or_create_preferences(user.id)
    cand_skills_rows = prof_repo.list_candidate_skills(user.id, profile.id)
    cand_skill_names = [sk.canonical_name for _, sk in cand_skills_rows]

    emb_svc = EmbeddingService(cfg)
    primary_resume = db.scalar(
        select(ResumeVersion)
        .where(ResumeVersion.user_id == user.id)
        .order_by(ResumeVersion.is_primary.desc(), ResumeVersion.created_at.desc())
    )
    if primary_resume and primary_resume.embedding:
        cand_vec = primary_resume.embedding
    else:
        fallback_text = " ".join([*(prefs.preferred_roles or []), *cand_skill_names, profile.summary or "software engineer"])
        cand_vec = emb_svc.encode_one(fallback_text, kind="query")

    stmt = select(Job).where(
        or_(Job.owner_user_id.is_(None), Job.owner_user_id == user.id),
        Job.is_expired.is_(False),
    )
    if job_ids:
        stmt = stmt.where(Job.id.in_(job_ids))
    jobs = list(db.scalars(stmt.order_by(Job.posted_at.desc().nulls_last(), Job.created_at.desc()).limit(limit)).all())
    if not jobs:
        _, _, mv = get_or_train_active_models(db, cfg)
        db.commit()
        return [], mv

    compat_model, ranker_model, ranker_mv = get_or_train_active_models(db, cfg)
    llm = LLMProvider(cfg) if explain_with_llm else None

    results: list[tuple[JobMatch, Job]] = []
    for job in jobs:
        job_emb = emb_svc.upsert_job_embedding(db, job)
        sem_sim = max(0.0, cosine_similarity(cand_vec, job_emb.embedding))

        js_rows = db.execute(
            select(JobSkill.requirement_type, Skill.canonical_name)
            .join(Skill, JobSkill.skill_id == Skill.id)
            .where(JobSkill.job_id == job.id)
        ).all()
        req_skills = [name for req, name in js_rows if req == "required"]
        pref_skills = [name for req, name in js_rows if req == "preferred"]

        feat_res = build_match_features(
            semantic_similarity=sem_sim,
            candidate_skills=cand_skill_names,
            job_required_skills=req_skills,
            job_preferred_skills=pref_skills,
            candidate_years_exp=float(profile.years_experience) if profile.years_experience is not None else None,
            candidate_seniority=profile.seniority_level,
            candidate_education=profile.education_level,
            preferred_locations=prefs.preferred_locations or [],
            preferred_regions=prefs.preferred_regions or [],
            preferred_work_modes=prefs.work_modes or [],
            preferred_job_types=prefs.job_types or [],
            preferred_min_salary=prefs.min_salary,
            preferred_currency=prefs.preferred_currency,
            job_min_exp=float(job.experience_min_years) if job.experience_min_years is not None else None,
            job_max_exp=float(job.experience_max_years) if job.experience_max_years is not None else None,
            job_seniority=job.seniority_level,
            job_education=job.min_education,
            job_location=job.location,
            job_region=job.region,
            job_work_mode=job.work_mode,
            job_type=job.job_type,
            job_salary_min_usd_eq=job.salary_min_usd_eq,
            job_posted_at=job.posted_at,
            interaction_affinity=_compute_interaction_affinity(db, user.id, job),
        )

        vec = feat_res.as_vector()
        prob, conf = compat_model.predict_probability(vec)
        rank_score = ranker_model.score([vec])[0]

        llm_note = None
        if llm is not None:
            llm_note = _generate_grounded_llm_explanation(
                llm,
                job=job,
                prob=prob,
                strong_skills=feat_res.strong_matching_skills,
                missing_skills=feat_res.missing_skills,
                reasons=feat_res.ranking_reasons,
            )

        existing = db.scalar(
            select(JobMatch).where(
                JobMatch.user_id == user.id,
                JobMatch.profile_id == profile.id,
                JobMatch.job_id == job.id,
            )
        )
        now = datetime.now(timezone.utc)
        if existing is None:
            existing = JobMatch(
                user_id=user.id,
                profile_id=profile.id,
                job_id=job.id,
            )
        existing.model_version_id = ranker_mv.id
        existing.semantic_similarity = round(sem_sim, 4)
        existing.compatibility_probability = prob
        existing.ranking_score = rank_score
        existing.confidence = conf
        existing.feature_vector_json = feat_res.features
        existing.strong_matching_skills = feat_res.strong_matching_skills
        existing.missing_skills = feat_res.missing_skills
        existing.experience_match = feat_res.experience_match
        existing.location_match = feat_res.location_match
        existing.seniority_match = feat_res.seniority_match
        existing.ranking_reasons = feat_res.ranking_reasons
        if llm_note is not None:
            existing.llm_explanation = llm_note
        existing.computed_at = now
        db.add(existing)
        results.append((existing, job))

    db.commit()
    results.sort(key=lambda pair: -pair[0].ranking_score)
    return results, ranker_mv
