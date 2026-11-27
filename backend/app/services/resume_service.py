"""Resume ingestion, parsing, skill persistence, and embedding service."""
from __future__ import annotations

import io
import uuid
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..core.config import Settings, get_settings
from ..core.exceptions import AppError
from ..core.security import validate_upload_bytes
from ..ml.embeddings import EmbeddingService
from ..ml.skill_extractor import StructuredResumeExtract, extract_structured_resume
from ..ml.skill_taxonomy import sync_taxonomy_to_db
from ..models import AuditLog, CandidateProfile, CandidateSkill, ResumeVersion, User
from ..repositories.profile_repo import ProfileRepository


def parse_resume_bytes(content: bytes, filename: str) -> str:
    """Extract plain text from validated PDF, DOCX, MD, or TXT bytes."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        pages = [f"--- Page {i + 1} ---\n{(p.extract_text() or '').strip()}" for i, p in enumerate(reader.pages)]
        text = "\n\n".join(p for p in pages if p.strip())
    elif ext == ".docx":
        from docx import Document

        doc = Document(io.BytesIO(content))
        parts = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    parts.append(" | ".join(cells))
        text = "\n".join(parts)
    elif ext in {".md", ".txt"}:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AppError("INVALID_ENCODING", "Text/Markdown resume must be valid UTF-8.", status_code=400) from exc
    else:
        raise AppError("UNSUPPORTED_FILE_TYPE", f"Unsupported resume format: {ext}", status_code=400)

    cleaned = text.strip()
    if not cleaned:
        raise AppError("EMPTY_RESUME_TEXT", "Could not extract readable text from resume.", status_code=422)
    return cleaned


def _compute_completeness(extract: StructuredResumeExtract, profile: CandidateProfile) -> float:
    score = 0.0
    if len(extract.skills) >= 5:
        score += 0.35
    elif extract.skills:
        score += 0.15
    if extract.experience_years is not None or extract.experiences:
        score += 0.25
    if extract.education_level != "unspecified":
        score += 0.15
    if extract.projects:
        score += 0.15
    if profile.headline or profile.summary:
        score += 0.10
    return round(min(1.0, score), 2)


def process_resume_upload(
    db: Session,
    user: User,
    filename: str,
    content: bytes,
    content_type: str | None = None,
    *,
    settings: Settings | None = None,
    embedding_service: EmbeddingService | None = None,
) -> tuple[ResumeVersion, StructuredResumeExtract]:
    """Validate, store, parse, extract skills, embed, and persist a user's resume."""
    cfg = settings or get_settings()
    safe_name, mime, sha256 = validate_upload_bytes(content, filename, content_type=content_type, max_bytes=cfg.max_upload_size_bytes)
    raw_text = parse_resume_bytes(content, safe_name)

    # User-isolated document storage
    user_dir = cfg.storage_root / str(user.id) / "resumes"
    user_dir.mkdir(parents=True, exist_ok=True)
    storage_key = f"{user.id}/resumes/{sha256[:12]}_{safe_name}"
    (cfg.storage_root / storage_key).write_bytes(content)

    # Extract structured resume data + skills (deterministic + optional consent-gated LLM)
    extract = extract_structured_resume(raw_text)

    # Compute embedding & track ModelVersion
    emb_svc = embedding_service or EmbeddingService(cfg)
    mv = emb_svc.get_or_register_model_version(db)
    vec = emb_svc.encode_one(raw_text, kind="document")

    repo = ProfileRepository(db)
    profile = repo.get_or_create_active_profile(user.id)
    if extract.experience_years is not None:
        profile.years_experience = extract.experience_years
    if extract.education_level != "unspecified":
        profile.education_level = extract.education_level
    if "summary" in extract.sections and not profile.summary:
        profile.summary = extract.sections["summary"][:600]
    profile.completeness_score = _compute_completeness(extract, profile)
    db.add(profile)

    # Demote prior primary uploaded resumes for this user
    db.execute(
        update(ResumeVersion)
        .where(ResumeVersion.user_id == user.id, ResumeVersion.kind == "uploaded")
        .values(is_primary=False)
    )
    existing_count = len(repo.list_resumes(user.id, limit=500))
    rv = ResumeVersion(
        user_id=user.id,
        profile_id=profile.id,
        version_num=existing_count + 1,
        kind="uploaded",
        filename=safe_name,
        mime_type=mime,
        file_size_bytes=len(content),
        storage_key=storage_key,
        sha256_hash=sha256,
        raw_text=raw_text,
        parsed_sections_json={
            "sections": list(extract.sections.keys()),
            "experiences": extract.experiences[:10],
            "projects": extract.projects[:10],
            "certifications": extract.certifications[:10],
        },
        embedding=vec,
        embedding_model_id=mv.id,
        is_primary=True,
    )
    db.add(rv)
    db.flush()

    # Sync canonical taxonomy & replace CandidateSkill rows for this profile
    taxonomy_map = sync_taxonomy_to_db(db)
    db.query(CandidateSkill).filter(CandidateSkill.profile_id == profile.id).delete()
    for sk in extract.skills:
        skill_row = taxonomy_map.get(sk.slug)
        if skill_row is None:
            continue
        db.add(
            CandidateSkill(
                user_id=user.id,
                profile_id=profile.id,
                skill_id=skill_row.id,
                proficiency=sk.proficiency,
                extraction_method=sk.extraction_method,
                confidence=sk.confidence,
                evidence_span=sk.evidence_span,
                source_section=sk.source_section,
            )
        )

    db.add(
        AuditLog(
            user_id=user.id,
            action="resume.upload",
            resource_type="resume_version",
            resource_id=str(rv.id),
            metadata_json={"filename": safe_name, "bytes": len(content), "skills_extracted": len(extract.skills)},
        )
    )
    db.commit()
    db.refresh(rv)
    return rv, extract
