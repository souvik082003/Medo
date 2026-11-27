"""Authentication service: registration, login, and consent management."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..core.exceptions import AppError
from ..core.security import create_access_token, hash_password, verify_password
from ..models import AuditLog, CandidateProfile, Job, User, UserPreference, UserRole
from ..schemas.auth import TokenResponse, UserLoginRequest, UserRegisterRequest, UserResponse


def register_user(db: Session, payload: UserRegisterRequest, ip_address: str | None = None) -> TokenResponse:
    """Register a new candidate account with default profile and preferences."""
    email_norm = payload.email.strip().lower()
    existing = db.scalar(select(User).where(User.email == email_norm))
    if existing is not None:
        raise AppError("EMAIL_EXISTS", "An account with this email already exists.", status_code=409)

    user = User(
        email=email_norm,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=UserRole.CANDIDATE.value,
        is_active=True,
    )
    db.add(user)
    db.flush()

    db.add(CandidateProfile(user_id=user.id, is_active=True))
    db.add(UserPreference(user_id=user.id))
    db.add(
        AuditLog(
            user_id=user.id,
            action="auth.register",
            resource_type="user",
            resource_id=str(user.id),
            ip_address=ip_address,
            metadata_json={"role": user.role},
        )
    )
    db.commit()
    db.refresh(user)

    cfg = get_settings()
    token = create_access_token(user.id, user.role, settings=cfg)
    return TokenResponse(
        access_token=token,
        expires_in_minutes=cfg.access_token_expire_minutes,
        user=UserResponse.model_validate(user),
    )


def login_user(
    db: Session,
    payload: UserLoginRequest,
    ip_address: str | None = None,
    settings: Settings | None = None,
) -> TokenResponse:
    """Authenticate credentials and issue a JWT token."""
    email_norm = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email_norm))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AppError("INVALID_CREDENTIALS", "Invalid email or password.", status_code=401)
    if not user.is_active:
        raise AppError("ACCOUNT_DISABLED", "This user account is disabled.", status_code=403)

    db.add(
        AuditLog(
            user_id=user.id,
            action="auth.login",
            resource_type="user",
            resource_id=str(user.id),
            ip_address=ip_address,
            metadata_json={},
        )
    )
    db.commit()

    cfg = settings or get_settings()
    token = create_access_token(user.id, user.role, settings=cfg)
    return TokenResponse(
        access_token=token,
        expires_in_minutes=cfg.access_token_expire_minutes,
        user=UserResponse.model_validate(user),
    )


def update_llm_consent(db: Session, user: User, granted: bool, ip_address: str | None = None) -> User:
    """Record explicit user consent for external LLM processing."""
    user.llm_consent_granted = granted
    user.llm_consent_at = datetime.now(timezone.utc) if granted else None
    db.add(user)
    db.add(
        AuditLog(
            user_id=user.id,
            action="auth.llm_consent",
            resource_type="user",
            resource_id=str(user.id),
            ip_address=ip_address,
            metadata_json={"granted": granted},
        )
    )
    db.commit()
    db.refresh(user)
    return user


_DEMO_RESUME_TEXT = """Aarav Mehta
Senior ML & Retrieval Systems Engineer | Bengaluru, India

Summary
4.5 years building distributed PyTorch training pipelines, hybrid BM25 + pgvector RAG systems,
FastAPI microservices, and TypeScript/Next.js AI product interfaces.

Skills
Python, PyTorch, FastAPI, PostgreSQL, pgvector, TypeScript, Next.js, React, Docker, Kubernetes,
LangGraph, Scikit-Learn, LightGBM, Redis

Experience
Senior ML Systems Engineer — HyperScale AI (2022 - Present)
- Built hybrid BM25 + dense vector job retrieval and LightGBM ranking services with FastAPI and PostgreSQL.
- Designed LangGraph multi-agent orchestration with OpenTelemetry tracing and Redis caching.
"""


def demo_login_user(
    db: Session,
    ip_address: str | None = None,
    settings: Settings | None = None,
) -> TokenResponse:
    """Authenticate into a pre-seeded non-production demo candidate workspace."""
    cfg = settings or get_settings()
    if cfg.environment.lower() == "production":
        raise AppError("DEMO_DISABLED", "Demo login is disabled in production.", status_code=403)

    demo_email = "demo@nexus-ai.dev"
    user = db.scalar(select(User).where(User.email == demo_email))
    if user is None:
        user = User(
            email=demo_email,
            password_hash=hash_password("DemoCandidatePass!2026"),
            full_name="Aarav Mehta (Demo)",
            role=UserRole.CANDIDATE.value,
            is_active=True,
            llm_consent_granted=True,
            llm_consent_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()

        db.add(
            CandidateProfile(
                user_id=user.id,
                headline="Senior ML & Retrieval Systems Engineer",
                summary="Builds PyTorch ML pipelines, hybrid BM25+pgvector search, FastAPI APIs, and Next.js interfaces.",
                years_experience=4.5,
                seniority_level="senior",
                current_location="Bengaluru, India",
                target_roles_json=["ML Systems Engineer", "Staff AI Retrieval Engineer", "Full-Stack AI Engineer"],
                completeness_score=0.9,
                is_active=True,
            )
        )
        db.add(
            UserPreference(
                user_id=user.id,
                preferred_roles=["ML Systems Engineer", "AI Engineer", "Full-Stack AI Engineer"],
                preferred_locations=["Bengaluru", "Remote"],
                preferred_regions=["IN", "US"],
                preferred_currency="INR",
                min_salary=3500000,
                work_modes=["remote", "hybrid"],
                job_types=["full-time"],
                career_goals="Lead distributed ML systems and grounded Agentic RAG architectures.",
            )
        )
        db.flush()

        # Seed demo resume, jobs, knowledge docs, and initial ranked matches cleanly
        from ..ingestion.connectors import DemoDatasetConnector
        from ..ingestion.pipeline import JobIngestionPipeline
        from ..ml.embeddings import EmbeddingService
        from ..rag.knowledge import ensure_public_knowledge_seeded
        from ..services.matching_service import compute_matches_for_user
        from ..services.resume_service import process_resume_upload

        process_resume_upload(
            db,
            user,
            "aarav_mehta_demo_resume.txt",
            _DEMO_RESUME_TEXT.encode("utf-8"),
            content_type="text/plain",
            settings=cfg,
        )
        emb = EmbeddingService(cfg)
        existing_real_jobs = (
            db.scalar(
                select(func.count(Job.id)).where(Job.source_name != "demo_dataset", Job.is_expired.is_(False))
            )
            or 0
        )
        if existing_real_jobs == 0:
            JobIngestionPipeline(db, embedding_service=emb).run_connector(
                DemoDatasetConnector(settings=cfg), keywords=[], limit=25
            )
        ensure_public_knowledge_seeded(db, settings=cfg)
        compute_matches_for_user(db, user, explain_with_llm=False, limit=10, settings=cfg)

    db.add(
        AuditLog(
            user_id=user.id,
            action="auth.demo_login",
            resource_type="user",
            resource_id=str(user.id),
            ip_address=ip_address,
            metadata_json={"demo": True},
        )
    )
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.role, settings=cfg)
    return TokenResponse(
        access_token=token,
        expires_in_minutes=cfg.access_token_expire_minutes,
        user=UserResponse.model_validate(user),
    )
