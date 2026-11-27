"""Phase 2 tests: resume parsing, upload validation, normalized skill extraction, and embedding pipeline."""
from __future__ import annotations

import io

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.core.config import Settings
from backend.app.core.database import get_sessionmaker
from backend.app.evaluation.embedding_bench import evaluate_embedding_models
from backend.app.ml.embeddings import EmbeddingService, cosine_similarity
from backend.app.ml.skill_extractor import extract_job_skills, extract_structured_resume
from backend.app.ml.skill_taxonomy import normalize_skill_name, sync_taxonomy_to_db
from backend.app.models import Job, JobSource, ModelVersion, Skill
from tests.conftest import auth_headers


SAMPLE_RESUME = """
Alex Rivera
alex@example.com | San Francisco, CA

Summary
Principal ML Systems Engineer with 6 years of experience building distributed training and RAG platforms.

Skills
Languages: Python, TypeScript, C++, SQL
Frameworks: PyTorch, FastAPI, React.js, Next.js, LangGraph
Libraries: Scikit-learn, LightGBM, Sentence Transformers, BM25
Databases: PostgreSQL, pgvector, Redis
Cloud & Infra: Kubernetes, Docker, AWS, Linux
Soft Skills: Technical Leadership, System Design

Experience
Staff ML Engineer | HyperScale AI | 2022 - 2026
- Architected distributed PyTorch FSDP + NCCL training pipelines across 512 GPUs, improving throughput by 2.4x.
- Built hybrid RAG retrieval combining pgvector, BM25, and ReactJS frontend observability dashboards.

Projects
- Open-source maintainer of fast-rerank library in Python and Rust.

Education
Master of Science in Computer Science, Stanford University, 2020
Certifications
- AWS Certified Machine Learning - Specialty
"""


def test_skill_taxonomy_normalization_and_no_fabrication():
    assert normalize_skill_name("React.js").canonical_name == "React"
    assert normalize_skill_name("ReactJS").canonical_name == "React"
    assert normalize_skill_name("React").canonical_name == "React"
    assert normalize_skill_name("k8s").canonical_name == "Kubernetes"
    assert normalize_skill_name("postgres").canonical_name == "PostgreSQL"

    # LLM suggests a hallucinated skill ("Ruby") not present in resume -> must be rejected
    extract = extract_structured_resume(
        SAMPLE_RESUME,
        llm_candidates=[
            {"skill": "Ruby", "proficiency": "deep_project"},
            {"skill": "Rust", "proficiency": "published_or_open_source"},
        ],
    )
    slugs = {s.slug for s in extract.skills}
    assert "react" in slugs
    assert "pytorch" in slugs
    assert "postgresql" in slugs
    assert "ruby" not in slugs  # Never invent candidate skills!
    assert extract.experience_years == 6.0
    assert extract.education_level == "master"
    assert len(extract.certifications) >= 1
    assert len(extract.projects) >= 1
    for sk in extract.skills:
        assert 0.0 < sk.confidence <= 1.0
        assert sk.evidence_span and len(sk.evidence_span) > 0


def test_resume_upload_validation_and_persistence(client: TestClient, test_settings: Settings):
    headers = auth_headers(client, "resume.user@example.com")

    # Reject unsupported file extension
    bad_ext = client.post(
        "/api/v1/profile/resume",
        headers=headers,
        files={"file": ("malware.exe", b"MZ...", "application/octet-stream")},
    )
    assert bad_ext.status_code == 400
    assert bad_ext.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"

    # Reject fake PDF magic bytes
    bad_pdf = client.post(
        "/api/v1/profile/resume",
        headers=headers,
        files={"file": ("resume.pdf", b"not-a-pdf", "application/pdf")},
    )
    assert bad_pdf.status_code == 400
    assert bad_pdf.json()["error"]["code"] == "INVALID_FILE_CONTENT"

    # Reject oversized file (> max_upload_size_bytes)
    oversized = b"A" * (test_settings.max_upload_size_bytes + 5)
    too_big = client.post(
        "/api/v1/profile/resume",
        headers=headers,
        files={"file": ("big.txt", oversized, "text/plain")},
    )
    assert too_big.status_code == 413

    # Valid DOCX resume upload
    from docx import Document

    doc = Document()
    for line in SAMPLE_RESUME.strip().splitlines():
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    ok = client.post(
        "/api/v1/profile/resume",
        headers=headers,
        files={
            "file": (
                "alex_resume.docx",
                buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert ok.status_code == 201, ok.text
    payload = ok.json()
    assert payload["resume"]["filename"] == "alex_resume.docx"
    assert payload["resume"]["is_primary"] is True
    assert payload["profile"]["education_level"] == "master"
    assert payload["profile"]["completeness_score"] >= 0.7
    skill_names = {s["canonical_name"] for s in payload["extracted_skills"]}
    assert {"Python", "PyTorch", "React", "PostgreSQL", "Kubernetes"}.issubset(skill_names)

    # Profile endpoint reflects stored skills and resume
    prof = client.get("/api/v1/profile", headers=headers).json()
    assert len(prof["resumes"]) == 1
    assert len(prof["skills"]) >= 10


def test_embeddings_caching_model_tracking_and_similarity(test_settings: Settings):
    svc = EmbeddingService(test_settings)
    v_ml = svc.encode_one("PyTorch distributed GPU training NCCL CUDA")
    v_ml_cached = svc.encode_one("PyTorch distributed GPU training NCCL CUDA")
    v_fe = svc.encode_one("React TypeScript Tailwind CSS frontend UI")
    assert v_ml == v_ml_cached
    assert len(v_ml) == 384
    assert cosine_similarity(v_ml, v_ml) > 0.99
    assert cosine_similarity(v_ml, v_fe) < 0.99

    SessionLocal = get_sessionmaker(test_settings)
    with SessionLocal() as db:
        taxonomy = sync_taxonomy_to_db(db)
        skill_vecs = svc.encode_batch([s.canonical_name for s in taxonomy.values()])
        for skill_row, vec in zip(taxonomy.values(), skill_vecs):
            skill_row.embedding = vec
            db.add(skill_row)

        src = JobSource(name="hn_test", source_type="official_api")
        db.add(src)
        db.flush()

        from backend.app.models import User
        from backend.app.core.security import hash_password

        user = User(email="vec@example.com", password_hash=hash_password("StrongPass123!"), full_name="Vec User")
        db.add(user)
        db.flush()

        j1 = Job(
            source_id=src.id,
            source_name="hn_test",
            content_hash="h1",
            title="ML Systems Engineer",
            company="Lab A",
            description="PyTorch distributed GPU training NCCL CUDA H100",
            application_url="https://example.com/1",
        )
        j2 = Job(
            source_id=src.id,
            source_name="hn_test",
            content_hash="h2",
            title="Frontend Engineer",
            company="Lab B",
            description="React TypeScript Tailwind CSS Figma UI components",
            application_url="https://example.com/2",
        )
        db.add_all([j1, j2])
        db.flush()

        svc.upsert_job_embedding(db, j1)
        svc.upsert_job_embedding(db, j2)
        db.commit()

        ranked = svc.search_similar_jobs(db, v_ml, user.id, top_k=2)
        assert len(ranked) == 2
        assert ranked[0][0].title == "ML Systems Engineer"
        assert ranked[0][1] > ranked[1][1]

        mv = db.scalar(select(ModelVersion).where(ModelVersion.model_kind == "embedding"))
        assert mv is not None
        assert db.scalar(select(Skill).where(Skill.slug == "pytorch")).embedding is not None

    # Verify job skill extractor detects required vs preferred
    jd_skills = extract_job_skills(
        "Required:\n- Python and PyTorch\nNice to Have:\n- vLLM and Kubernetes",
        title="ML Engineer",
    )
    req_map = {s.slug: s.proficiency for s in jd_skills}
    assert req_map["python"] == "required"
    assert req_map["vllm"] == "preferred"


def test_embedding_benchmark_runner_stub():
    results = evaluate_embedding_models(use_stub=True)
    assert len(results) == 3
    names = {r.model_name for r in results}
    assert "stub:all-MiniLM-L6-v2" in names
    assert "stub:BAAI/bge-base-en-v1.5" in names
    assert "stub:intfloat/e5-base-v2" in names
    for r in results:
        assert r.is_stub is True
        assert 0.0 < r.mrr <= 1.0
